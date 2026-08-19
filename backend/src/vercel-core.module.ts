import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { ThrottlerModule } from '@nestjs/throttler';
import { OriginGuard } from './common/guards/origin.guard';
import { PrismaModule } from './modules/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { SportsModule } from './modules/sports/sports.module';

/**
 * Vercel production recovery module.
 *
 * Kept in its own source file so Vercel startup does not evaluate imports for
 * analytics, ingestion, billing, schedulers or other optional feature modules.
 * The full AppModule remains unchanged for CI/local/Docker/non-Vercel runtimes.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
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
  ],
  providers: [{ provide: APP_GUARD, useClass: OriginGuard }],
})
export class VercelCoreModule {}
