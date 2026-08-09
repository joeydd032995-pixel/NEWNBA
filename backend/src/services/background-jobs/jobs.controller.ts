import { Controller, Post, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { JobsService } from './jobs.service';
import { JwtAuthGuard } from '../../modules/auth/guards/jwt-auth.guard';

/**
 * Manual trigger endpoints for background sync jobs (odds, NBA stats, BallDontLie stats).
 *
 * Guarded with JwtAuthGuard + ThrottlerGuard: despite the `admin/` path prefix, there is
 * no admin/role field on User today, so this only requires a valid logged-in user rather
 * than a specific admin role — but that's enough to close the previous unauthenticated,
 * unthrottled exposure (anyone on the public internet could otherwise call sync-odds
 * on demand and burn through the Odds API's monthly quota arbitrarily).
 */
@UseGuards(JwtAuthGuard, ThrottlerGuard)
@Controller('admin/jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Post('sync-odds')
  syncOdds() {
    return this.jobs.triggerOddsSync();
  }

  @Post('sync-nba-stats')
  syncNbaStats() {
    return this.jobs.triggerNbaSync();
  }

  @Post('sync-bdl-stats')
  syncBdlStats() {
    return this.jobs.triggerBdlSync();
  }
}
