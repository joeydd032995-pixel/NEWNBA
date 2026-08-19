import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { CacheModule } from '@nestjs/cache-manager';
import { OriginGuard } from './common/guards/origin.guard';
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
import { ParlayModule } from './modules/parlay/parlay.module';
import { BankrollModule } from './modules/bankroll/bankroll.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { BillingModule } from './modules/billing/billing.module';
import { ProjectionModule } from './modules/projection/projection.module';

/**
 * Production recovery boundary for Vercel Services.
 *
 * The current full AppModule has a startup-time provider failure in Vercel even
 * though the runtime can connect to Neon and execute SQL successfully. Keep the
 * essential account + sports surface online while that optional-provider failure
 * is isolated. Local, CI, Docker and non-Vercel hosts continue to load the full
 * application exactly as before.
 */
const VERCEL_CORE_MODE = process.env.VERCEL === '1';

const OPTIONAL_FEATURE_MODULES = VERCEL_CORE_MODE
  ? []
  : [
      AnalyticsModule,
      EVModule,
      ArbitrageModule,
      JobsModule,
      AlertsModule,
      BetslipModule,
      PlayerPropsModule,
      DataIngestionModule,
      ExpertPicksModule,
      LiveModule,
      ParlayModule,
      BankrollModule,
      NotificationsModule,
      BillingModule,
      ProjectionModule,
    ];

if (VERCEL_CORE_MODE) {
  console.warn(
    '[bootstrap] Vercel recovery core mode enabled: loading Config, Prisma, Auth and Sports only while optional startup failure is isolated.',
  );
}

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
    SportsModule,
    ...OPTIONAL_FEATURE_MODULES,
  ],
  providers: [
    // Applies to every route (state-changing methods only — GET/HEAD/OPTIONS
    // no-op). See origin.guard.ts for why this is needed: production cookies
    // are `sameSite: 'none'` (frontend and backend are on different domains),
    // which makes cross-site CSRF via bare HTML form-posts possible unless the
    // request's Origin is validated server-side.
    { provide: APP_GUARD, useClass: OriginGuard },
  ],
})
export class AppModule {}
