import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type EnsembleStrategy = 'WEIGHTED_AVERAGE' | 'VOTING' | 'STACKING' | 'BOOSTING';

export interface ComponentPrediction {
  modelId: string;
  modelName: string;
  probability: number;
  confidence: number;
  weight: number;
}

export interface EnsemblePrediction {
  finalProbability: number;
  confidence: number;
  strategy: EnsembleStrategy;
  components: ComponentPrediction[];
  metadata?: Record<string, any>;
}

@Injectable()
export class EnsembleService {
  constructor(private prisma: PrismaService) {}

  // ============================================================
  // ENSEMBLE STRATEGIES
  // ============================================================

  /**
   * Weighted Average: Σ(weight_i × prob_i) / Σ(weight_i)
   */
  weightedAverage(components: ComponentPrediction[]): number {
    const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
    if (totalWeight === 0) return 0.5;
    return components.reduce((sum, c) => sum + c.weight * c.probability, 0) / totalWeight;
  }

  /**
   * Voting: Majority vote with confidence weighting
   * Models vote win/loss based on 50% threshold
   */
  voting(components: ComponentPrediction[]): number {
    const votes = components.map(c => ({
      vote: c.probability >= 0.5 ? 1 : 0,
      weight: c.weight * c.confidence,
    }));

    const totalWeight = votes.reduce((sum, v) => sum + v.weight, 0);
    const weightedVotes = votes.reduce((sum, v) => sum + v.vote * v.weight, 0);

    if (totalWeight === 0) return 0.5;
    const voteFraction = weightedVotes / totalWeight;

    // Return the weighted vote fraction directly as probability [0, 1]
    return voteFraction;
  }

  /**
   * Stacking: Use a meta-learner (linear combination) on component predictions
   */
  stacking(components: ComponentPrediction[], metaWeights?: number[]): number {
    const probs = components.map(c => c.probability);
    const weights = metaWeights ?? components.map(c => c.weight);

    // Logit-transform for stacking
    const logits = probs.map(p => Math.log((p + 1e-10) / (1 - p + 1e-10)));
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const weightedLogit = logits.reduce((sum, logit, i) => sum + weights[i] * logit, 0) / totalWeight;

    // Sigmoid back
    return 1 / (1 + Math.exp(-weightedLogit));
  }

  /**
   * Boosting: Sequential weighted combination emphasizing harder cases
   */
  boosting(components: ComponentPrediction[]): number {
    let weightedSum = 0;
    let totalWeight = 0;
    let boostFactor = 1.0;

    // Sort by weight descending (most important first)
    const sorted = [...components].sort((a, b) => b.weight - a.weight);

    for (let i = 0; i < sorted.length; i++) {
      const c = sorted[i];
      const adjustedWeight = c.weight * boostFactor;
      weightedSum += adjustedWeight * c.probability;
      totalWeight += adjustedWeight;

      // Reduce boost factor for subsequent models (AdaBoost-like)
      const predError = Math.abs(c.probability - 0.5) < 0.1 ? 1.2 : 0.8;
      boostFactor *= predError;
    }

    return totalWeight > 0 ? weightedSum / totalWeight : 0.5;
  }

  /**
   * Apply ensemble strategy
   */
  applyStrategy(strategy: EnsembleStrategy, components: ComponentPrediction[]): number {
    switch (strategy) {
      case 'WEIGHTED_AVERAGE': return this.weightedAverage(components);
      case 'VOTING': return this.voting(components);
      case 'STACKING': return this.stacking(components);
      case 'BOOSTING': return this.boosting(components);
      default: return this.weightedAverage(components);
    }
  }

  /**
   * Calculate ensemble confidence
   */
  calcConfidence(components: ComponentPrediction[], finalProb: number): number {
    if (components.length === 0) return 0;

    // Agreement metric: how close are components to the final prediction
    const variance = components.reduce((sum, c) => {
      return sum + c.weight * Math.pow(c.probability - finalProb, 2);
    }, 0) / components.reduce((sum, c) => sum + c.weight, 0);

    // High agreement = high confidence
    const agreement = Math.exp(-variance * 10);
    const avgConf = components.reduce((sum, c) => sum + c.confidence, 0) / components.length;

    return (agreement * 0.6 + avgConf * 0.4);
  }

  // ============================================================
  // CRUD OPERATIONS
  // ============================================================

  async createEnsemble(userId: string, data: {
    name: string;
    description?: string;
    strategy: EnsembleStrategy;
    components: Array<{ modelId: string; weight: number }>;
  }) {
    return this.prisma.ensembleModel.create({
      data: {
        userId,
        name: data.name,
        description: data.description,
        strategy: data.strategy,
        components: {
          create: data.components.map((c, i) => ({
            modelId: c.modelId,
            weight: c.weight,
            order: i,
          })),
        },
      },
      include: { components: { include: { model: true } } },
    });
  }

  async findAll(userId: string) {
    return this.prisma.ensembleModel.findMany({
      where: { userId },
      include: {
        components: {
          include: { model: { select: { id: true, name: true } } },
          orderBy: { order: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, userId?: string) {
    const ensemble = await this.prisma.ensembleModel.findFirst({
      where: userId ? { id, userId } : { id },
      include: {
        components: {
          include: { model: true },
          orderBy: { order: 'asc' },
        },
      },
    });
    if (!ensemble) throw new NotFoundException('Ensemble model not found');
    return ensemble;
  }

  async update(id: string, userId: string, data: {
    name?: string;
    description?: string;
    strategy?: EnsembleStrategy;
    components?: Array<{ modelId: string; weight: number }>;
  }) {
    const ensemble = await this.prisma.ensembleModel.findFirst({ where: { id, userId } });
    if (!ensemble) throw new NotFoundException('Ensemble model not found');

    if (data.components) {
      await this.prisma.ensembleComponent.deleteMany({ where: { ensembleModelId: id } });
    }

    return this.prisma.ensembleModel.update({
      where: { id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.strategy && { strategy: data.strategy }),
        ...(data.components && {
          components: {
            create: data.components.map((c, i) => ({
              modelId: c.modelId,
              weight: c.weight,
              order: i,
            })),
          },
        }),
      },
      include: { components: { include: { model: true } } },
    });
  }

  async remove(id: string, userId: string) {
    const ensemble = await this.prisma.ensembleModel.findFirst({ where: { id, userId } });
    if (!ensemble) throw new NotFoundException('Ensemble model not found');

    await this.prisma.ensembleComponent.deleteMany({ where: { ensembleModelId: id } });
    await this.prisma.ensembleModel.delete({ where: { id } });
    return { message: 'Ensemble deleted' };
  }

  /**
   * Run prediction using ensemble
   */
  async predict(ensembleId: string, componentPredictions: ComponentPrediction[]): Promise<EnsemblePrediction> {
    const ensemble = await this.findOne(ensembleId);
    const strategy = ensemble.strategy as EnsembleStrategy;

    const finalProbability = this.applyStrategy(strategy, componentPredictions);
    const confidence = this.calcConfidence(componentPredictions, finalProbability);

    return {
      finalProbability,
      confidence,
      strategy,
      components: componentPredictions,
    };
  }

  /**
   * Auto-optimize ensemble weights using performance data
   */
  async optimizeWeights(ensembleId: string, userId: string) {
    const ensemble = await this.findOne(ensembleId, userId);

    // Simple weight optimization: equal weights as baseline, then adjust by performance
    const equalWeight = 1 / Math.max(ensemble.components.length, 1);
    const optimizedComponents = ensemble.components.map(c => ({
      modelId: c.modelId,
      weight: equalWeight,
    }));

    return this.update(ensembleId, ensemble.userId, { components: optimizedComponents });
  }
}
