import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NbaDataModule } from '../../services/nba-data/nba-data.module';
import { DataIngestionController } from './data-ingestion.controller';
import { DataIngestionService } from './data-ingestion.service';
import { NormalizationService } from './normalization.service';
import { InjuryIngestService } from './injury-ingest.service';
import { NewsIngestService } from './news-ingest.service';
import { PublicBettingService } from './public-betting.service';
import { OpportunityDataIngestionJob } from '../../services/background-jobs/opportunity-data-ingestion.job';

@Module({
  imports: [PrismaModule, NbaDataModule],
  controllers: [DataIngestionController],
  providers: [
    DataIngestionService,
    NormalizationService,
    InjuryIngestService,
    NewsIngestService,
    PublicBettingService,
    OpportunityDataIngestionJob,
  ],
  exports: [
    DataIngestionService,
    NormalizationService,
    InjuryIngestService,
    NewsIngestService,
    PublicBettingService,
  ],
})
export class DataIngestionModule {}
