import { Module } from '@nestjs/common';
import { SportsController } from './sports.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SportsController],
})
export class SportsModule {}
