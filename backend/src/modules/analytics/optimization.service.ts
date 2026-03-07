import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from './analytics.service';

export interface GAConfig {
  populationSize: number;     // 50-200
  maxGenerations: number;     // 50-100
  mutationRate: number;       // 0.01-0.3
  crossoverRate: number;      // 0.6-0.9
  elitismCount: number;       // 1-5
  fitnessWeights: {
    roi: number;
    winRate: number;
    sharpeRatio: number;
    calibration: number;
  };
  weightKeys: string[];
}

export interface Individual {
  weights: Record<string, number>;
  fitness: number;
  roi: number;
  winRate: number;
  sharpeRatio: number;
  calibration: number;
}

export interface GenerationResult {
  generation: number;
  bestFitness: number;
  avgFitness: number;
  bestWeights: Record<string, number>;
  population: Individual[];
}

@Injectable()
export class OptimizationService {
  private readonly logger = new Logger(OptimizationService.name);

  constructor(
    private prisma: PrismaService,
    private analyticsService: AnalyticsService,
  ) {}

  // ============================================================
  // GENETIC ALGORITHM
  // ============================================================

  /**
   * Initialize random population
   */
  private initializePopulation(config: GAConfig): Individual[] {
    return Array.from({ length: config.populationSize }, () => ({
      weights: this.randomWeights(config.weightKeys),
      fitness: 0,
      roi: 0,
      winRate: 0,
      sharpeRatio: 0,
      calibration: 0,
    }));
  }

  /**
   * Generate random normalized weights
   */
  private randomWeights(keys: string[]): Record<string, number> {
    const raw = keys.reduce((acc, key) => {
      acc[key] = Math.random();
      return acc;
    }, {} as Record<string, number>);
    return this.normalizeWeights(raw);
  }

  /**
   * Normalize weights to sum to 1
   */
  private normalizeWeights(weights: Record<string, number>): Record<string, number> {
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    if (total === 0) return weights;
    const normalized = {} as Record<string, number>;
    for (const [k, v] of Object.entries(weights)) {
      normalized[k] = v / total;
    }
    return normalized;
  }

  /**
   * Evaluate fitness of an individual using historical predictions
   */
  private evaluateFitness(individual: Individual, config: GAConfig): Individual {
    // Simulate performance based on weights (in production, evaluate against actual data)
    const simulatedPerformance = this.simulatePerformance(individual.weights);

    individual.roi = simulatedPerformance.roi;
    individual.winRate = simulatedPerformance.winRate;
    individual.sharpeRatio = simulatedPerformance.sharpeRatio;
    individual.calibration = simulatedPerformance.calibration;

    // Weighted fitness function
    individual.fitness =
      config.fitnessWeights.roi * Math.tanh(individual.roi * 5) +
      config.fitnessWeights.winRate * individual.winRate +
      config.fitnessWeights.sharpeRatio * Math.tanh(individual.sharpeRatio) +
      config.fitnessWeights.calibration * individual.calibration;

    return individual;
  }

  /**
   * Simulate performance (for demo; in production use actual data)
   */
  private simulatePerformance(weights: Record<string, number>) {
    const weightValues = Object.values(weights);
    const maxWeight = Math.max(...weightValues);
    const entropy = -weightValues.reduce((sum, w) => (w > 0 ? sum + w * Math.log(w + 1e-10) : sum), 0);

    // Penalize overly concentrated models, reward balanced ones
    const balance = entropy / Math.log(weightValues.length);
    const noise = (Math.random() - 0.5) * 0.05;

    return {
      roi: (balance * 0.15 - maxWeight * 0.1 + noise),
      winRate: 0.52 + balance * 0.05 + noise,
      sharpeRatio: balance * 1.5 + noise,
      calibration: 0.7 + balance * 0.2 + noise,
    };
  }

  /**
   * Tournament selection
   */
  private tournamentSelect(population: Individual[], tournamentSize: number = 3): Individual {
    const tournament = Array.from({ length: tournamentSize }, () =>
      population[Math.floor(Math.random() * population.length)]
    );
    return tournament.reduce((best, ind) => ind.fitness > best.fitness ? ind : best);
  }

  /**
   * Single-point crossover
   */
  private crossover(parent1: Individual, parent2: Individual, config: GAConfig): [Individual, Individual] {
    if (Math.random() > config.crossoverRate) {
      return [{ ...parent1, weights: { ...parent1.weights } }, { ...parent2, weights: { ...parent2.weights } }];
    }

    const keys = config.weightKeys;
    const crossoverPoint = Math.floor(Math.random() * keys.length);

    const child1Weights: Record<string, number> = {};
    const child2Weights: Record<string, number> = {};

    keys.forEach((key, i) => {
      if (i < crossoverPoint) {
        child1Weights[key] = parent1.weights[key] ?? 0;
        child2Weights[key] = parent2.weights[key] ?? 0;
      } else {
        child1Weights[key] = parent2.weights[key] ?? 0;
        child2Weights[key] = parent1.weights[key] ?? 0;
      }
    });

    return [
      { weights: this.normalizeWeights(child1Weights), fitness: 0, roi: 0, winRate: 0, sharpeRatio: 0, calibration: 0 },
      { weights: this.normalizeWeights(child2Weights), fitness: 0, roi: 0, winRate: 0, sharpeRatio: 0, calibration: 0 },
    ];
  }

  /**
   * Gaussian mutation
   */
  private mutate(individual: Individual, config: GAConfig): Individual {
    const mutated = { ...individual.weights };
    for (const key of config.weightKeys) {
      if (Math.random() < config.mutationRate) {
        mutated[key] = Math.max(0, mutated[key] + (Math.random() - 0.5) * 0.2);
      }
    }
    return { ...individual, weights: this.normalizeWeights(mutated) };
  }

  /**
   * Run complete genetic algorithm
   */
  async runGeneticAlgorithm(
    optimizationRunId: string,
    config: GAConfig,
    onGeneration?: (result: GenerationResult) => void,
  ): Promise<{ bestWeights: Record<string, number>; bestFitness: number; convergenceData: GenerationResult[] }> {
    await this.prisma.optimizationRun.update({
      where: { id: optimizationRunId },
      data: { status: 'RUNNING', startedAt: new Date() },
    });

    let population = this.initializePopulation(config);
    population = population.map(ind => this.evaluateFitness(ind, config));

    const convergenceData: GenerationResult[] = [];
    let bestEver: Individual = population.reduce((b, i) => i.fitness > b.fitness ? i : b);

    for (let gen = 0; gen < config.maxGenerations; gen++) {
      // Sort by fitness descending
      population.sort((a, b) => b.fitness - a.fitness);

      const bestFitness = population[0].fitness;
      const avgFitness = population.reduce((sum, i) => sum + i.fitness, 0) / population.length;

      if (population[0].fitness > bestEver.fitness) {
        bestEver = { ...population[0] };
      }

      const genResult: GenerationResult = {
        generation: gen,
        bestFitness,
        avgFitness,
        bestWeights: { ...population[0].weights },
        population: population.slice(0, 10).map(i => ({ ...i })),
      };
      convergenceData.push(genResult);

      if (onGeneration) onGeneration(genResult);

      // Save generation to DB
      await this.prisma.optimizationCandidate.create({
        data: {
          optimizationRunId,
          generation: gen,
          weights: population[0].weights,
          fitness: bestFitness,
          roi: population[0].roi,
          winRate: population[0].winRate,
          sharpeRatio: population[0].sharpeRatio,
          isElite: true,
        },
      });

      // New generation
      const newPop: Individual[] = [];

      // Elitism: keep top individuals
      for (let e = 0; e < config.elitismCount; e++) {
        newPop.push({ ...population[e] });
      }

      // Fill rest with crossover + mutation
      while (newPop.length < config.populationSize) {
        const parent1 = this.tournamentSelect(population);
        const parent2 = this.tournamentSelect(population);
        const [child1, child2] = this.crossover(parent1, parent2, config);

        newPop.push(this.evaluateFitness(this.mutate(child1, config), config));
        if (newPop.length < config.populationSize) {
          newPop.push(this.evaluateFitness(this.mutate(child2, config), config));
        }
      }

      population = newPop;

      // Early stopping if converged
      if (gen > 20 && this.hasConverged(convergenceData.slice(-10))) {
        this.logger.log(`Converged at generation ${gen}`);
        break;
      }
    }

    await this.prisma.optimizationRun.update({
      where: { id: optimizationRunId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        bestFitness: bestEver.fitness,
        bestWeights: bestEver.weights,
        generations: convergenceData.length,
        convergenceData: convergenceData as any,
      },
    });

    return {
      bestWeights: bestEver.weights,
      bestFitness: bestEver.fitness,
      convergenceData,
    };
  }

  private hasConverged(recentGenerations: GenerationResult[]): boolean {
    if (recentGenerations.length < 5) return false;
    const fitnessValues = recentGenerations.map(g => g.bestFitness);
    const range = Math.max(...fitnessValues) - Math.min(...fitnessValues);
    return range < 0.001;
  }

  async createOptimizationRun(
    userId: string,
    name: string,
    config: GAConfig,
  ) {
    return this.prisma.optimizationRun.create({
      data: {
        userId,
        name,
        status: 'PENDING',
        config: config as any,
        populationSize: config.populationSize,
        mutationRate: config.mutationRate,
        crossoverRate: config.crossoverRate,
        elitismCount: config.elitismCount,
      },
    });
  }

  async getOptimizationRuns(userId: string) {
    return this.prisma.optimizationRun.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { candidates: true } } },
    });
  }

  async getOptimizationRun(id: string) {
    return this.prisma.optimizationRun.findUnique({
      where: { id },
      include: {
        candidates: { where: { isElite: true }, orderBy: { generation: 'asc' } },
      },
    });
  }

  async cancelRun(id: string, userId: string) {
    return this.prisma.optimizationRun.updateMany({
      where: { id, userId, status: { in: ['PENDING', 'RUNNING'] } },
      data: { status: 'CANCELLED' },
    });
  }
}
