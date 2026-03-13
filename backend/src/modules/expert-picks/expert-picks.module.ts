import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ExpertPicksService } from './expert-picks.service';
import { ExpertPicksController } from './expert-picks.controller';

@Module({
  imports: [PrismaModule],
  providers: [ExpertPicksService],
  controllers: [ExpertPicksController],
  exports: [ExpertPicksService],
})
export class ExpertPicksModule {}
