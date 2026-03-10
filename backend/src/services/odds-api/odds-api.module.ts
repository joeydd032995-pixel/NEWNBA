import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OddsApiService } from './odds-api.service';

@Module({
  imports: [ConfigModule],
  providers: [OddsApiService],
  exports: [OddsApiService],
})
export class OddsApiModule {}
