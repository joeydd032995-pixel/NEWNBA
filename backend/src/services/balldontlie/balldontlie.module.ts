import { Module } from '@nestjs/common';
import { BallDontLieService } from './balldontlie.service';

@Module({
  providers: [BallDontLieService],
  exports: [BallDontLieService],
})
export class BallDontLieModule {}
