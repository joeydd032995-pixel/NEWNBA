import { Module } from '@nestjs/common';
import { DataIngestionService } from './data-ingestion.service';
import { DataIngestionController } from './data-ingestion.controller';
import { NormalizationService } from './normalization.service';
import { InjuryIngestService } from './injury-ingest.service';
import { NewsIngestService } from './news-ingest.service';
import { PublicBettingService } from './public-betting.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [
    DataIngestionService,
    NormalizationService,
    InjuryIngestService,
    NewsIngestService,
    PublicBettingService,
  ],
  controllers: [DataIngestionController],
  exports: [
    DataIngestionService,
    InjuryIngestService,
    NewsIngestService,
    NormalizationService,
    PublicBettingService,
  ],
})
export class DataIngestionModule {}
