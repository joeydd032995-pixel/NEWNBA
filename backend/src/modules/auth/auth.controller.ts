import {
  Controller, Post, Get, Body, UseGuards, Request, Response,
  HttpCode, HttpStatus, UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Response as Res } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { SignupDto, LoginDto } from './dto/auth.dto';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

const IS_PROD = process.env.NODE_ENV === 'production';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  /**
   * Authentication controller
   *
   * Public routes:
   * - POST /auth/signup - Register new user (no auth required)
   * - POST /auth/login - Authenticate with email/password (LocalAuthGuard)
   * - POST /auth/refresh - Refresh tokens via httpOnly cookie (no JWT guard)
   *
   * Protected routes (require JWT):
   * - POST /auth/logout - Clear session
   * - GET /auth/profile - Get current user profile
   */
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {}

  /**
   * Register new user (PUBLIC)
   *
   * @param dto - { email, password, firstName?, lastName? }
   * @returns User object with access/refresh tokens set in httpOnly cookies
   */
  @Post('signup')
  @ApiOperation({ summary: 'Register new user' })
  async signup(@Body() dto: SignupDto, @Response({ passthrough: true }) res: Res) {
    const result = await this.authService.signup(dto);
    this.setTokenCookies(res, result.accessToken, result.refreshToken);
    return { user: result.user };
  }

  /**
   * Login with email and password (PUBLIC)
   *
   * Uses LocalAuthGuard (validates credentials via local strategy).
   * Sets accessToken and refreshToken in httpOnly cookies.
   *
   * @param req.user - Validated user from LocalAuthGuard
   * @returns User object
   */
  @UseGuards(LocalAuthGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email/password' })
  async login(@Request() req, @Response({ passthrough: true }) res: Res) {
    const result = await this.authService.login(req.user);
    this.setTokenCookies(res, result.accessToken, result.refreshToken);
    return { user: result.user };
  }

  /**
   * Refresh access token using refreshToken cookie (PUBLIC)
   *
   * Reads refreshToken from httpOnly cookie, validates it,
   * and issues new access/refresh tokens.
   *
   * @param req.cookies.refreshToken - Refresh token from httpOnly cookie
   * @returns { message: 'Token refreshed' }
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using httpOnly cookie' })
  async refresh(@Request() req, @Response({ passthrough: true }) res: Res) {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) throw new UnauthorizedException('No refresh token');
    const tokens = await this.authService.refresh(refreshToken);
    this.setTokenCookies(res, tokens.accessToken, tokens.refreshToken);
    return { message: 'Token refreshed' };
  }

  /**
   * Logout user and clear sessions (PROTECTED - requires JWT)
   *
   * Clears refresh token from database and clears auth cookies.
   * Requires valid JWT access token.
   *
   * @param req.user.id - Current user ID from JWT payload
   * @returns { message: 'Logged out successfully' }
   */
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  async logout(@Request() req, @Response({ passthrough: true }) res: Res) {
    await this.authService.logout(req.user.id);
    res.clearCookie('accessToken', this.cookieOptions());
    res.clearCookie('refreshToken', this.cookieOptions());
    return { message: 'Logged out successfully' };
  }

  /**
   * Get current user profile (PROTECTED - requires JWT)
   *
   * Returns complete user object including plan type, subscription status, etc.
   *
   * @param req.user.id - Current user ID from JWT payload
   * @returns User profile object
   */
  @UseGuards(JwtAuthGuard)
  @Get('profile')
  @ApiBearerAuth()
  getProfile(@Request() req) {
    return this.authService.getProfile(req.user.id);
  }

  // ─── Helpers ───────────────────────────────────────────────

  private cookieOptions() {
    // Frontend (Vercel) and backend (Railway) are hosted on different top-level
    // domains in production, making this a cross-site relationship. `sameSite: 'lax'`
    // cookies are not sent on cross-site fetch/axios requests (only top-level
    // navigations), so production must use `sameSite: 'none'`, which in turn requires
    // `secure: true` (HTTPS-only) — both Vercel and Railway serve over HTTPS by default.
    return {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: (IS_PROD ? 'none' : 'lax') as 'none' | 'lax',
      path: '/',
    };
  }

  private setTokenCookies(res: Res, accessToken: string, refreshToken: string) {
    res.cookie('accessToken', accessToken, {
      ...this.cookieOptions(),
      maxAge: this.parseExpiry(this.configService.get<string>('JWT_EXPIRES_IN', '15m')),
    });
    res.cookie('refreshToken', refreshToken, {
      ...this.cookieOptions(),
      maxAge: this.parseExpiry(this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '7d')),
    });
  }

  /** Convert e.g. '15m', '2h', '7d' → milliseconds */
  private parseExpiry(value: string): number {
    const m = value.match(/^(\d+)(m|h|d)$/);
    if (!m) return 15 * 60 * 1000;
    const n = parseInt(m[1], 10);
    return m[2] === 'm' ? n * 60_000 : m[2] === 'h' ? n * 3_600_000 : n * 86_400_000;
  }
}
