import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { CacheModule } from '@nestjs/cache-manager';
import { PrismaModule } from './modules/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { EVModule } from './modules/ev/ev.module';
import { ArbitrageModule } from './modules/arbitrage/arbitrage.module';
import { SportsModule } from './modules/sports/sports.module';
import { JobsModule } from './services/background-jobs/jobs.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { BetslipModule } from './modules/betslip/betslip.module';
import { PlayerPropsModule } from './modules/player-props/player-props.module';
import { DataIngestionModule } from './modules/data-ingestion/data-ingestion.module';
import { ExpertPicksModule } from './modules/expert-picks/expert-picks.module';
import { LiveModule } from './modules/live/live.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    // cache-manager v5 (used by @nestjs/cache-manager v2) has an incompatible
    // store API with cache-manager-redis-store v3. Use the built-in in-memory
    // store which is fully compatible and sufficient for this dev environment.
    CacheModule.register({ isGlobal: true, ttl: 60 }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [{
        ttl: config.get<number>('THROTTLE_TTL', 60) * 1000,
        limit: config.get<number>('THROTTLE_LIMIT', 100),
      }],
    }),
    PrismaModule,
    AuthModule,
    AnalyticsModule,
    EVModule,
    ArbitrageModule,
    SportsModule,
    JobsModule,
    AlertsModule,
    BetslipModule,
    PlayerPropsModule,
    DataIngestionModule,
    ExpertPicksModule,
    LiveModule,
  ],
})
export class AppModule {}
