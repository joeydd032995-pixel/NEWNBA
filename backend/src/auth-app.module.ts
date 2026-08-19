import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { OriginGuard } from './common/guards/origin.guard';
import { PrismaModule } from './modules/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';

/**
 * Minimal production auth application.
 *
 * This intentionally excludes analytics, ingestion, billing and background-job
 * modules so account creation/login remain available if an unrelated provider
 * fails during full AppModule startup. It reuses the exact same AuthModule and
 * PrismaService as the full backend rather than duplicating authentication logic.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    PrismaModule,
    AuthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: OriginGuard }],
})
export class AuthAppModule {}
