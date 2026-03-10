import { Controller, Post } from '@nestjs/common';
import { JobsService } from './jobs.service';

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
