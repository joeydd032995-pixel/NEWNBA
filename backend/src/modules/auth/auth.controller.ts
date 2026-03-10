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
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {}

  @Post('signup')
  @ApiOperation({ summary: 'Register new user' })
  async signup(@Body() dto: SignupDto, @Response({ passthrough: true }) res: Res) {
    const result = await this.authService.signup(dto);
    this.setTokenCookies(res, result.accessToken, result.refreshToken);
    return { user: result.user };
  }

  @UseGuards(LocalAuthGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email/password' })
  async login(@Request() req, @Response({ passthrough: true }) res: Res) {
    const result = await this.authService.login(req.user);
    this.setTokenCookies(res, result.accessToken, result.refreshToken);
    return { user: result.user };
  }

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

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  @ApiBearerAuth()
  getProfile(@Request() req) {
    return this.authService.getProfile(req.user.id);
  }

  // ─── Helpers ───────────────────────────────────────────────

  private cookieOptions() {
    return { httpOnly: true, secure: IS_PROD, sameSite: 'lax' as const, path: '/' };
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
