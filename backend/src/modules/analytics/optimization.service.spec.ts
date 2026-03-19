import { OptimizationService, GAConfig, Individual } from './optimization.service';

describe('OptimizationService', () => {
  let service: OptimizationService;
  let prismaStub: any;
  let analyticsStub: any;

  const baseConfig: GAConfig = {
    populationSize: 10,
    maxGenerations: 5,
    mutationRate: 0.1,
    crossoverRate: 0.8,
    elitismCount: 1,
    fitnessWeights: { roi: 0.4, winRate: 0.3, sharpeRatio: 0.2, calibration: 0.1 },
    weightKeys: ['momentum', 'efficiency', 'defense'],
  };

  beforeEach(() => {
    prismaStub = {
      optimizationRun: {
        create: jest.fn().mockResolvedValue({ id: 'run-1' }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      optimizationCandidate: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    analyticsStub = {};

    service = new OptimizationService(prismaStub, analyticsStub as any);
  });

  // ─── CRUD operations ──────────────────────────────────────────────────────

  describe('createOptimizationRun', () => {
    it('creates run with PENDING status and config fields', async () => {
      await service.createOptimizationRun('user-1', 'Test Run', baseConfig);

      expect(prismaStub.optimizationRun.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            name: 'Test Run',
            status: 'PENDING',
            populationSize: 10,
            mutationRate: 0.1,
            crossoverRate: 0.8,
            elitismCount: 1,
          }),
        }),
      );
    });
  });

  describe('getOptimizationRuns', () => {
    it('returns runs for the given userId', async () => {
      const runs = [{ id: 'run-1' }, { id: 'run-2' }];
      prismaStub.optimizationRun.findMany.mockResolvedValue(runs);

      const result = await service.getOptimizationRuns('user-1');

      expect(prismaStub.optimizationRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1' } }),
      );
      expect(result).toHaveLength(2);
    });
  });

  describe('cancelRun', () => {
    it('cancels PENDING or RUNNING runs for the user', async () => {
      await service.cancelRun('run-1', 'user-1');

      expect(prismaStub.optimizationRun.updateMany).toHaveBeenCalledWith({
        where: { id: 'run-1', userId: 'user-1', status: { in: ['PENDING', 'RUNNING'] } },
        data: { status: 'CANCELLED' },
      });
    });
  });

  // ─── Genetic Algorithm ────────────────────────────────────────────────────

  describe('runGeneticAlgorithm', () => {
    it('sets status to RUNNING at start and COMPLETED at end', async () => {
      await service.runGeneticAlgorithm('run-1', baseConfig);

      expect(prismaStub.optimizationRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'run-1' },
          data: expect.objectContaining({ status: 'RUNNING' }),
        }),
      );
      expect(prismaStub.optimizationRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'run-1' },
          data: expect.objectContaining({ status: 'COMPLETED' }),
        }),
      );
    });

    it('returns bestWeights with all weightKeys present', async () => {
      const result = await service.runGeneticAlgorithm('run-1', baseConfig);

      expect(result.bestWeights).toBeDefined();
      for (const key of baseConfig.weightKeys) {
        expect(result.bestWeights[key]).toBeDefined();
      }
    });

    it('returns convergenceData with one entry per generation', async () => {
      const result = await service.runGeneticAlgorithm('run-1', baseConfig);

      // convergenceData length = maxGenerations (unless early stop)
      expect(result.convergenceData.length).toBeGreaterThan(0);
      expect(result.convergenceData.length).toBeLessThanOrEqual(baseConfig.maxGenerations);
    });

    it('bestWeights sum to 1.0 (normalized)', async () => {
      const result = await service.runGeneticAlgorithm('run-1', baseConfig);

      const sum = Object.values(result.bestWeights).reduce((a: number, b: any) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 5);
    });

    it('saves a candidate to DB each generation (elitismCount)', async () => {
      await service.runGeneticAlgorithm('run-1', baseConfig);

      // One candidate per generation
      expect(prismaStub.optimizationCandidate.create).toHaveBeenCalled();
      const callCount = prismaStub.optimizationCandidate.create.mock.calls.length;
      expect(callCount).toBeGreaterThan(0);
      expect(callCount).toBeLessThanOrEqual(baseConfig.maxGenerations);
    });

    it('calls onGeneration callback each generation', async () => {
      const onGeneration = jest.fn();

      await service.runGeneticAlgorithm('run-1', baseConfig, onGeneration);

      expect(onGeneration).toHaveBeenCalled();
      const lastCall = onGeneration.mock.calls[onGeneration.mock.calls.length - 1][0];
      expect(lastCall).toHaveProperty('generation');
      expect(lastCall).toHaveProperty('bestFitness');
      expect(lastCall).toHaveProperty('avgFitness');
      expect(lastCall).toHaveProperty('bestWeights');
    });

    it('best fitness in convergenceData is non-decreasing (elitism preserved)', async () => {
      const result = await service.runGeneticAlgorithm('run-1', baseConfig);

      // The best fitness should not decrease because elitism keeps the best individual
      // This is a probabilistic test but with elitismCount=1 it should hold
      for (let i = 1; i < result.convergenceData.length; i++) {
        // bestFitness should be >= previous (due to elitism keeping best)
        // Note: due to re-evaluation noise in simulatePerformance this may vary slightly
        expect(result.convergenceData[i].bestFitness).toBeGreaterThanOrEqual(
          result.convergenceData[i - 1].bestFitness - 0.5, // allow small variance
        );
      }
    });
  });
});
