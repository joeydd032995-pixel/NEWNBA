import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * OriginGuard - basic CSRF mitigation for cookie-authenticated state-changing requests.
 *
 * Why this exists: in production the frontend (Vercel) and backend (Railway) are on
 * different top-level domains, so auth cookies must be `sameSite: 'none'` for the
 * frontend's fetch/axios calls to work at all (see auth.controller.ts's
 * cookieOptions()). That, in turn, means browsers will attach those cookies to
 * cross-site requests too — including a bare cross-site `<form method="POST">`,
 * which isn't subject to CORS preflight at all (CORS only stops a malicious page's
 * JS from *reading* the response, not the request from reaching the server and
 * executing). Without this guard, any attacker-controlled page could fire a
 * cross-site POST at a JwtAuthGuard-protected mutating route and have it execute
 * as the logged-in victim.
 *
 * How it works: for state-changing HTTP methods, reject requests whose `Origin`
 * header (falling back to the origin parsed from `Referer`) doesn't match the
 * configured frontend origin(s). Requests with neither header present are allowed
 * through — those aren't browser-driven CSRF vectors (curl, server-to-server
 * calls, Swagger's "Try it out").
 *
 * Apply alongside JwtAuthGuard: `@UseGuards(JwtAuthGuard, OriginGuard)`.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  private readonly logger = new Logger(OriginGuard.name);

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const method = (req.method ?? 'GET').toUpperCase();

    if (!STATE_CHANGING_METHODS.has(method)) {
      return true;
    }

    const origin = req.headers?.origin ?? this.originFromReferer(req.headers?.referer);

    // No Origin/Referer at all: not a browser-driven request, allow through
    // (curl, server-to-server calls, Swagger UI's "Try it out").
    if (!origin) {
      return true;
    }

    const allowedOrigins = this.allowedOrigins(req);
    if (allowedOrigins.includes(origin)) {
      return true;
    }

    this.logger.warn(`Blocked ${method} ${req.url} — Origin "${origin}" not in allow-list`);
    throw new ForbiddenException('Request origin not allowed');
  }

  private allowedOrigins(req: { protocol?: string; headers?: Record<string, any> }): string[] {
    const frontendUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:5173');
    // Include the backend's own origin so same-origin requests aren't blocked —
    // notably Swagger UI's "Try it out" at /api/docs is served from this same
    // host, and browsers send an Origin header on same-origin POST/PUT/PATCH/DELETE
    // requests too, not only cross-origin ones.
    const selfOrigin = req.headers?.host ? `${req.protocol ?? 'https'}://${req.headers.host}` : null;
    return [frontendUrl, 'http://localhost:3000', 'http://localhost:5173', selfOrigin].filter(
      (o): o is string => !!o,
    );
  }

  private originFromReferer(referer?: string): string | null {
    if (!referer) return null;
    try {
      return new URL(referer).origin;
    } catch {
      return null;
    }
  }
}
