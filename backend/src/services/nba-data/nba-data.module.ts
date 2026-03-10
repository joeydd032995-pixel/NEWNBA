import { Module } from '@nestjs/common';
import { NbaDataService } from './nba-data.service';

@Module({
  providers: [NbaDataService],
  exports: [NbaDataService],
})
export class NbaDataModule {}
