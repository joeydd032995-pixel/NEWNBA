import {
  Controller, Get, Post, Put, Delete, Body, Param, Query,
  UseGuards, Request, HttpCode, HttpStatus, Logger, NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlanGuard } from '../auth/guards/plan.guard';
import { RequiresPlan } from '../auth/decorators/require-plan.decorator';
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
@UseGuards(JwtAuthGuard, PlanGuard)
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
  // CUSTOM MODELS (PREMIUM)
  // ============================================================

  @Get('models')
  @RequiresPlan('PREMIUM')
  getModels(@Request() req) {
    return this.customModelService.findAll(req.user.id);
  }

  @Post('models')
  @RequiresPlan('PREMIUM')
  createModel(@Request() req, @Body() dto: CreateModelDto) {
    return this.customModelService.create(req.user.id, dto);
  }

  @Get('models/:id')
  @RequiresPlan('PREMIUM')
  getModel(@Param('id') id: string, @Request() req) {
    return this.customModelService.findOne(id, req.user.id);
  }

  @Put('models/:id')
  @RequiresPlan('PREMIUM')
  updateModel(@Param('id') id: string, @Request() req, @Body() dto: UpdateModelDto) {
    return this.customModelService.update(id, req.user.id, dto);
  }

  @Delete('models/:id')
  @HttpCode(HttpStatus.OK)
  @RequiresPlan('PREMIUM')
  deleteModel(@Param('id') id: string, @Request() req) {
    return this.customModelService.remove(id, req.user.id);
  }

  @Post('models/:id/duplicate')
  @RequiresPlan('PREMIUM')
  duplicateModel(@Param('id') id: string, @Request() req) {
    return this.customModelService.duplicate(id, req.user.id);
  }

  // ============================================================
  // PERFORMANCE TRACKING (PREMIUM)
  // ============================================================

  @Post('performance/predict')
  @RequiresPlan('PREMIUM')
  recordPrediction(@Request() req, @Body() dto: RecordPredictionDto) {
    return this.performanceService.recordPrediction(req.user.id, dto.modelId, dto);
  }

  @Put('performance/resolve/:predictionId')
  @RequiresPlan('PREMIUM')
  resolvePrediction(@Param('predictionId') id: string, @Request() req, @Body() dto: ResolvePerformancePredictionDto) {
    return this.performanceService.resolvePrediction(id, dto.actualResult, req.user.id);
  }

  @Get('performance/:modelId')
  @RequiresPlan('PREMIUM')
  getPerformance(@Param('modelId') modelId: string, @Query('period') period?: string) {
    return this.performanceService.calculatePerformance(modelId, period);
  }

  @Get('performance/:modelId/history')
  @RequiresPlan('PREMIUM')
  getPerformanceHistory(@Param('modelId') modelId: string) {
    return this.performanceService.getPerformanceHistory(modelId);
  }

  @Get('leaderboard')
  @RequiresPlan('PREMIUM')
  getLeaderboard(@Query('limit') limit?: number) {
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    return this.performanceService.getLeaderboard(safeLimit);
  }

  @Get('performance/dashboard')
  @RequiresPlan('PREMIUM')
  getPerformanceDashboard(@Query('days') days?: string) {
    return this.performanceService.getDashboard(Number(days ?? 90));
  }

  // ============================================================
  // GENETIC ALGORITHM OPTIMIZATION (PREMIUM)
  // ============================================================

  @Get('optimization')
  @RequiresPlan('PREMIUM')
  getOptimizationRuns(@Request() req) {
    return this.optimizationService.getOptimizationRuns(req.user.id);
  }

  @Post('optimization')
  @RequiresPlan('PREMIUM')
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
  @RequiresPlan('PREMIUM')
  getOptimizationRun(@Param('id') id: string, @Request() req) {
    return this.optimizationService.getOptimizationRun(id, req.user.id);
  }

  @Post('optimization/:id/start')
  @RequiresPlan('PREMIUM')
  async startOptimization(@Param('id') id: string, @Request() req) {
    const run = await this.optimizationService.getOptimizationRun(id, req.user.id);
    if (!run) throw new NotFoundException(`Optimization run ${id} not found`);
    this.optimizationService.runGeneticAlgorithm(id, run.config as any).catch((err) =>
      this.logger.error(`GA optimization failed for run ${id}: ${err.message}`),
    );
    return { message: 'Optimization started', runId: id };
  }

  @Post('optimization/:id/cancel')
  @RequiresPlan('PREMIUM')
  cancelOptimization(@Param('id') id: string, @Request() req) {
    return this.optimizationService.cancelRun(id, req.user.id);
  }

  // ============================================================
  // ENSEMBLE MODELS (PREMIUM)
  // ============================================================

  @Get('ensemble')
  @RequiresPlan('PREMIUM')
  getEnsembles(@Request() req) {
    return this.ensembleService.findAll(req.user.id);
  }

  @Post('ensemble')
  @RequiresPlan('PREMIUM')
  createEnsemble(@Request() req, @Body() dto: CreateEnsembleDto) {
    return this.ensembleService.createEnsemble(req.user.id, dto as any);
  }

  @Get('ensemble/:id')
  @RequiresPlan('PREMIUM')
  getEnsemble(@Param('id') id: string, @Request() req) {
    return this.ensembleService.findOne(id, req.user.id);
  }

  @Put('ensemble/:id')
  @RequiresPlan('PREMIUM')
  updateEnsemble(@Param('id') id: string, @Request() req, @Body() dto: UpdateEnsembleDto) {
    return this.ensembleService.update(id, req.user.id, dto as any);
  }

  @Delete('ensemble/:id')
  @RequiresPlan('PREMIUM')
  removeEnsemble(@Param('id') id: string, @Request() req) {
    return this.ensembleService.remove(id, req.user.id);
  }

  @Post('ensemble/:id/optimize-weights')
  @RequiresPlan('PREMIUM')
  optimizeEnsembleWeights(@Param('id') id: string, @Request() req) {
    return this.ensembleService.optimizeWeights(id, req.user.id);
  }

  // ============================================================
  // A/B TESTING (PREMIUM)
  // ============================================================

  @Get('ab-tests')
  @RequiresPlan('PREMIUM')
  getABTests(@Request() req) {
    return this.abTestingService.findAll(req.user.id);
  }

  @Post('ab-tests')
  @RequiresPlan('PREMIUM')
  createABTest(@Request() req, @Body() dto: CreateABTestDto) {
    return this.abTestingService.createTest(req.user.id, dto);
  }

  @Get('ab-tests/:id')
  @RequiresPlan('PREMIUM')
  getABTest(@Param('id') id: string) {
    return this.abTestingService.findOne(id);
  }

  @Post('ab-tests/:id/start')
  @RequiresPlan('PREMIUM')
  startABTest(@Param('id') id: string, @Request() req) {
    return this.abTestingService.startTest(id, req.user.id);
  }

  @Post('ab-tests/:id/stop')
  @RequiresPlan('PREMIUM')
  stopABTest(@Param('id') id: string, @Request() req) {
    return this.abTestingService.stopTest(id, req.user.id);
  }

  @Delete('ab-tests/:id')
  @RequiresPlan('PREMIUM')
  deleteABTest(@Param('id') id: string, @Request() req) {
    return this.abTestingService.deleteTest(id, req.user.id);
  }

  @Post('ab-tests/:id/record')
  @RequiresPlan('PREMIUM')
  recordABResult(@Param('id') id: string, @Body() dto: RecordABResultDto) {
    return this.abTestingService.recordResult(id, dto);
  }

  @Get('ab-tests/:id/analyze')
  @RequiresPlan('PREMIUM')
  analyzeABTest(@Param('id') id: string) {
    return this.abTestingService.analyzeTest(id);
  }
}
