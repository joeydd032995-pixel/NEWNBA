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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const redisHost = config.get<string>('REDIS_HOST');
        if (redisHost) {
          // Lazy-load redis store only when host is configured
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const redisStore = require('cache-manager-redis-store');
          return {
            store: redisStore,
            host: redisHost,
            port: config.get<number>('REDIS_PORT', 6379),
            password: config.get<string>('REDIS_PASSWORD') || undefined,
            ttl: 60, // default 60s TTL
          };
        }
        // In-memory fallback when Redis isn't configured
        return { ttl: 60 };
      },
    }),
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
