import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AsyncLocalStorage } from 'node:async_hooks';

const STAT_LINE_WRITE_ACTIONS = new Set([
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
]);

/**
 * Prisma client with an explicit integrity boundary for StatLine mutations.
 *
 * StatLine↔Event identity is foundational to correlation calibration, matchup
 * analysis and post-bet settlement. A historical generic-anchor regression must
 * therefore fail closed at the database client boundary, not merely by code
 * convention in one ingestion job.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly verifiedStatLineWrite = new AsyncLocalStorage<boolean>();

  constructor() {
    super();
    this.$use(async (params, next) => {
      if (
        params.model === 'StatLine' &&
        STAT_LINE_WRITE_ACTIONS.has(params.action) &&
        this.verifiedStatLineWrite.getStore() !== true
      ) {
        throw new Error(
          'Unverified StatLine write rejected. Resolve the exact NBA event first and execute through runVerifiedStatLineWrite().',
        );
      }
      return next(params);
    });
  }

  runVerifiedStatLineWrite<T>(operation: () => Promise<T>): Promise<T> {
    return this.verifiedStatLineWrite.run(true, operation);
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
