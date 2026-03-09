import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './modules/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { EVModule } from './modules/ev/ev.module';
import { ArbitrageModule } from './modules/arbitrage/arbitrage.module';
import { SportsModule } from './modules/sports/sports.module';
import { JobsModule } from './services/background-jobs/jobs.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { BetslipModule } from './modules/betslip/betslip.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
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
  ],
})
export class AppModule {}
