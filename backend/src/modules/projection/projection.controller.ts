import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProjectionService } from './projection.service';
import { AnalyzePlayerPropDto } from './dto/analyze-player-prop.dto';

@ApiTags('projection')
@Controller('projection')
export class ProjectionController {
  constructor(private readonly projectionService: ProjectionService) {}

  @Post('player-prop')
  @ApiOperation({
    summary: 'Run a deterministic Opportunity-First player-prop projection and price it against a market',
  })
  analyzePlayerProp(@Body() dto: AnalyzePlayerPropDto) {
    return this.projectionService.analyzePlayerProp(dto as any);
  }
}
