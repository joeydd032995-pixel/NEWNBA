import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DataIngestionService } from './data-ingestion.service';
import { InjuryIngestService } from './injury-ingest.service';
import { NewsIngestService } from './news-ingest.service';
import { PublicBettingService } from './public-betting.service';

@ApiTags('Data Ingestion')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('data-ingestion')
export class DataIngestionController {
  constructor(
    private dataIngestion: DataIngestionService,
    private injuryIngest: InjuryIngestService,
    private newsIngest: NewsIngestService,
    private publicBetting: PublicBettingService,
  ) {}

  @Post('trigger/full')
  triggerFull() {
    void this.dataIngestion.runFullIngestion();
    return { message: 'Full ingestion triggered' };
  }

  @Post('trigger/injuries')
  async triggerInjuries() {
    const count = await this.injuryIngest.syncInjuries();
    return { message: `Synced ${count} injury reports` };
  }

  @Post('trigger/news')
  async triggerNews() {
    const count = await this.newsIngest.syncNews();
    return { message: `Synced ${count} news items` };
  }

  @Post('trigger/public-betting')
  async triggerPublicBetting() {
    const count = await this.publicBetting.syncPublicBetting();
    return { message: `Synced ${count} public betting splits` };
  }

  @Post('trigger/snapshot')
  async triggerSnapshot() {
    const count = await this.dataIngestion.snapshotOdds();
    return { message: `Snapped ${count} odds` };
  }

  @Get('line-movements')
  async getLineMovements() {
    return this.dataIngestion.detectLineMovements(3);
  }

  @Get('injuries/active')
  async getActiveInjuries() {
    return this.injuryIngest.getActiveInjuries();
  }

  @Get('news/recent')
  async getRecentNews() {
    return this.newsIngest.getRecentNews(30);
  }
}
