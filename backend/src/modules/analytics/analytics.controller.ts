import {
  Controller, Get, Post, Put, Delete, Body, Param, Query,
  UseGuards, Request, HttpCode, HttpStatus, Logger, NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AnalyticsService } from './analytics.service';
import { CustomModelService } from './custom-model.service';
import { PerformanceTrackingService } from './performance-tracking.service';
import { OptimizationService } from './optimization.service';
import { EnsembleService } from './ensemble.service';
import { ABTestingService } from './ab-testing.service';
import {
  CreateModelDto, UpdateModelDto,
  TrueShootingDto, EFGDto, PythagoreanDto, FourFactorsDto, CalcEVDto, RemoveVigDto,
  RecordPredictionDto, ResolvePerformancePredictionDto,
  CreateOptimizationRunDto,
  CreateEnsembleDto, UpdateEnsembleDto,
  CreateABTestDto, RecordABResultDto,
} from './dto/analytics.dto';

@ApiTags('Analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class AnalyticsController {
  private readonly logger = new Logger(AnalyticsController.name);

  constructor(
    private analyticsService: AnalyticsService,
    private customModelService: CustomModelService,
    private performanceService: PerformanceTrackingService,
    private optimizationService: OptimizationService,
    private ensembleService: EnsembleService,
    private abTestingService: ABTestingService,
  ) {}

  // ============================================================
  // FORMULAS & CALCULATIONS
  // ============================================================

  @Get('formulas/preset-models')
  @ApiOperation({ summary: 'Get all 12 preset models' })
  getPresetModels() {
    return this.analyticsService.getPresetModels();
  }

  @Get('formulas/preset-models/:id')
  getPresetModel(@Param('id') id: string) {
    return this.analyticsService.getPresetModel(id);
  }

  @Post('formulas/true-shooting')
  calcTrueShooting(@Body() dto: TrueShootingDto) {
    return { tsPct: this.analyticsService.calcTrueShooting(dto.points, dto.fga, dto.fta) };
  }

  @Post('formulas/efg')
  calcEFG(@Body() dto: EFGDto) {
    return { efgPct: this.analyticsService.calcEffectiveFG(dto.fg, dto.fg3, dto.fga) };
  }

  @Post('formulas/pythagorean')
  calcPythagorean(@Body() dto: PythagoreanDto) {
    return { winPct: this.analyticsService.calcPythagoreanWinPct(dto.pointsFor, dto.pointsAgainst) };
  }

  @Post('formulas/four-factors')
  calcFourFactors(@Body() dto: FourFactorsDto) {
    return {
      offense: this.analyticsService.calcFourFactorsOffense(dto.efgPct, dto.tovPct, dto.orbPct, dto.ftr),
    };
  }

  @Post('formulas/ev')
  calcEV(@Body() dto: CalcEVDto) {
    return this.analyticsService.calcEV(dto.trueProb, dto.odds, dto.stake);
  }

  @Post('formulas/remove-vig')
  removeVig(@Body() dto: RemoveVigDto) {
    return { trueProbabilities: this.analyticsService.removeVig(dto.odds) };
  }

  // ============================================================
  // CUSTOM MODELS
  // ============================================================

  @Get('models')
  getModels(@Request() req) {
    return this.customModelService.findAll(req.user.id);
  }

  @Post('models')
  createModel(@Request() req, @Body() dto: CreateModelDto) {
    return this.customModelService.create(req.user.id, dto);
  }

  @Get('models/:id')
  getModel(@Param('id') id: string, @Request() req) {
    return this.customModelService.findOne(id, req.user.id);
  }

  @Put('models/:id')
  updateModel(@Param('id') id: string, @Request() req, @Body() dto: UpdateModelDto) {
    return this.customModelService.update(id, req.user.id, dto);
  }

  @Delete('models/:id')
  @HttpCode(HttpStatus.OK)
  deleteModel(@Param('id') id: string, @Request() req) {
    return this.customModelService.remove(id, req.user.id);
  }

  @Post('models/:id/duplicate')
  duplicateModel(@Param('id') id: string, @Request() req) {
    return this.customModelService.duplicate(id, req.user.id);
  }

  // ============================================================
  // PERFORMANCE TRACKING
  // ============================================================

  @Post('performance/predict')
  recordPrediction(@Request() req, @Body() dto: RecordPredictionDto) {
    return this.performanceService.recordPrediction(req.user.id, dto.modelId, dto);
  }

  @Put('performance/resolve/:predictionId')
  resolvePrediction(@Param('predictionId') id: string, @Request() req, @Body() dto: ResolvePerformancePredictionDto) {
    return this.performanceService.resolvePrediction(id, dto.actualResult, req.user.id);
  }

  @Get('performance/:modelId')
  getPerformance(@Param('modelId') modelId: string, @Query('period') period?: string) {
    return this.performanceService.calculatePerformance(modelId, period);
  }

  @Get('performance/:modelId/history')
  getPerformanceHistory(@Param('modelId') modelId: string) {
    return this.performanceService.getPerformanceHistory(modelId);
  }

  @Get('leaderboard')
  getLeaderboard(@Query('limit') limit?: number) {
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    return this.performanceService.getLeaderboard(safeLimit);
  }

  @Get('performance/dashboard')
  getPerformanceDashboard(@Query('days') days?: string) {
    return this.performanceService.getDashboard(Number(days ?? 90));
  }

  // ============================================================
  // GENETIC ALGORITHM OPTIMIZATION
  // ============================================================

  @Get('optimization')
  getOptimizationRuns(@Request() req) {
    return this.optimizationService.getOptimizationRuns(req.user.id);
  }

  @Post('optimization')
  async createOptimizationRun(@Request() req, @Body() dto: CreateOptimizationRunDto) {
    const run = await this.optimizationService.createOptimizationRun(req.user.id, dto.name, dto.config as any);

    if (dto.runNow) {
      // Run async (don't await - long running)
      this.optimizationService.runGeneticAlgorithm(run.id, dto.config as any).catch(err =>
        console.error('GA optimization failed:', err)
      );
    }

    return run;
  }

  @Get('optimization/:id')
  getOptimizationRun(@Param('id') id: string, @Request() req) {
    return this.optimizationService.getOptimizationRun(id, req.user.id);
  }

  @Post('optimization/:id/start')
  async startOptimization(@Param('id') id: string, @Request() req) {
    const run = await this.optimizationService.getOptimizationRun(id, req.user.id);
    if (!run) throw new NotFoundException(`Optimization run ${id} not found`);
    this.optimizationService.runGeneticAlgorithm(id, run.config as any).catch((err) =>
      this.logger.error(`GA optimization failed for run ${id}: ${err.message}`),
    );
    return { message: 'Optimization started', runId: id };
  }

  @Post('optimization/:id/cancel')
  cancelOptimization(@Param('id') id: string, @Request() req) {
    return this.optimizationService.cancelRun(id, req.user.id);
  }

  // ============================================================
  // ENSEMBLE MODELS
  // ============================================================

  @Get('ensemble')
  getEnsembles(@Request() req) {
    return this.ensembleService.findAll(req.user.id);
  }

  @Post('ensemble')
  createEnsemble(@Request() req, @Body() dto: CreateEnsembleDto) {
    return this.ensembleService.createEnsemble(req.user.id, dto as any);
  }

  @Get('ensemble/:id')
  getEnsemble(@Param('id') id: string, @Request() req) {
    return this.ensembleService.findOne(id, req.user.id);
  }

  @Put('ensemble/:id')
  updateEnsemble(@Param('id') id: string, @Request() req, @Body() dto: UpdateEnsembleDto) {
    return this.ensembleService.update(id, req.user.id, dto as any);
  }

  @Delete('ensemble/:id')
  removeEnsemble(@Param('id') id: string, @Request() req) {
    return this.ensembleService.remove(id, req.user.id);
  }

  @Post('ensemble/:id/optimize-weights')
  optimizeEnsembleWeights(@Param('id') id: string, @Request() req) {
    return this.ensembleService.optimizeWeights(id, req.user.id);
  }

  // ============================================================
  // A/B TESTING
  // ============================================================

  @Get('ab-tests')
  getABTests(@Request() req) {
    return this.abTestingService.findAll(req.user.id);
  }

  @Post('ab-tests')
  createABTest(@Request() req, @Body() dto: CreateABTestDto) {
    return this.abTestingService.createTest(req.user.id, dto);
  }

  @Get('ab-tests/:id')
  getABTest(@Param('id') id: string) {
    return this.abTestingService.findOne(id);
  }

  @Post('ab-tests/:id/start')
  startABTest(@Param('id') id: string, @Request() req) {
    return this.abTestingService.startTest(id, req.user.id);
  }

  @Post('ab-tests/:id/stop')
  stopABTest(@Param('id') id: string, @Request() req) {
    return this.abTestingService.stopTest(id, req.user.id);
  }

  @Delete('ab-tests/:id')
  deleteABTest(@Param('id') id: string, @Request() req) {
    return this.abTestingService.deleteTest(id, req.user.id);
  }

  @Post('ab-tests/:id/record')
  recordABResult(@Param('id') id: string, @Body() dto: RecordABResultDto) {
    return this.abTestingService.recordResult(id, dto);
  }

  @Get('ab-tests/:id/analyze')
  analyzeABTest(@Param('id') id: string) {
    return this.abTestingService.analyzeTest(id);
  }
}
