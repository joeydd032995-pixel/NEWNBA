import { createHash } from 'crypto';
import { ConfigService } from '@nestjs/config';

export interface ResolvedAuthSecrets {
  jwtSecret: string;
  refreshSecret: string;
  usingDerivedJwtSecret: boolean;
  usingDerivedRefreshSecret: boolean;
}

function deriveSecret(databaseUrl: string, purpose: 'access' | 'refresh'): string {
  return createHash('sha512')
    .update(`newnba-auth:${purpose}:v1\0`)
    .update(databaseUrl)
    .digest('hex');
}

/**
 * Resolve stable JWT signing secrets.
 *
 * Production should set JWT_SECRET and JWT_REFRESH_SECRET explicitly. As an
 * availability safeguard, a deployment that already has a secret DATABASE_URL
 * can deterministically derive independent access/refresh signing keys instead
 * of crashing the entire Nest application at startup.
 *
 * The database URL is never returned or logged, and explicit JWT secrets always
 * take precedence over the derived fallback.
 */
export function resolveAuthSecrets(config: Pick<ConfigService, 'get'>): ResolvedAuthSecrets {
  const configuredJwtSecret = config.get<string>('JWT_SECRET');
  const configuredRefreshSecret = config.get<string>('JWT_REFRESH_SECRET');

  if (configuredJwtSecret && configuredRefreshSecret) {
    return {
      jwtSecret: configuredJwtSecret,
      refreshSecret: configuredRefreshSecret,
      usingDerivedJwtSecret: false,
      usingDerivedRefreshSecret: false,
    };
  }

  const databaseUrl = config.get<string>('DATABASE_URL');
  if (!databaseUrl) {
    throw new Error(
      'Authentication secrets are unavailable. Configure JWT_SECRET and JWT_REFRESH_SECRET, or provide DATABASE_URL for the deterministic emergency fallback.',
    );
  }

  return {
    jwtSecret: configuredJwtSecret || deriveSecret(databaseUrl, 'access'),
    refreshSecret: configuredRefreshSecret || deriveSecret(databaseUrl, 'refresh'),
    usingDerivedJwtSecret: !configuredJwtSecret,
    usingDerivedRefreshSecret: !configuredRefreshSecret,
  };
}
