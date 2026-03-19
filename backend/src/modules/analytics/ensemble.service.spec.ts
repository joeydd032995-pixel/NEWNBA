import { NotFoundException } from '@nestjs/common';
import { EnsembleService, ComponentPrediction } from './ensemble.service';

describe('EnsembleService', () => {
  let service: EnsembleService;
  let prismaStub: any;

  const makeComponent = (probability: number, weight: number, confidence = 0.8): ComponentPrediction => ({
    modelId: `model-${probability}`,
    modelName: `Model ${probability}`,
    probability,
    confidence,
    weight,
  });

  beforeEach(() => {
    prismaStub = {
      ensembleModel: {
        create: jest.fn().mockResolvedValue({ id: 'ensemble-1', components: [] }),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({ id: 'ensemble-1', components: [] }),
        delete: jest.fn().mockResolvedValue({}),
      },
      ensembleComponent: {
        deleteMany: jest.fn().mockResolvedValue({}),
      },
    };

    service = new EnsembleService(prismaStub);
  });

  // ─── weightedAverage ─────────────────────────────────────────────────────

  describe('weightedAverage', () => {
    it('computes weighted average correctly', () => {
      const components = [
        makeComponent(0.6, 0.7),
        makeComponent(0.4, 0.3),
      ];

      const result = service.weightedAverage(components);

      // (0.7 × 0.6 + 0.3 × 0.4) / (0.7 + 0.3) = (0.42 + 0.12) / 1.0 = 0.54
      expect(result).toBeCloseTo(0.54, 5);
    });

    it('returns 0.5 when total weight is zero', () => {
      const components = [makeComponent(0.6, 0), makeComponent(0.4, 0)];

      expect(service.weightedAverage(components)).toBe(0.5);
    });

    it('returns single component probability when only one component', () => {
      const components = [makeComponent(0.75, 1.0)];

      expect(service.weightedAverage(components)).toBeCloseTo(0.75, 5);
    });
  });

  // ─── voting ──────────────────────────────────────────────────────────────

  describe('voting', () => {
    it('returns majority vote fraction weighted by confidence', () => {
      // 2 votes for "win" (prob >= 0.5), 1 vote against
      const components = [
        makeComponent(0.7, 1.0, 0.9),  // win
        makeComponent(0.8, 1.0, 0.9),  // win
        makeComponent(0.3, 1.0, 0.8),  // loss
      ];

      const result = service.voting(components);

      // Win votes dominate → result > 0.5
      expect(result).toBeGreaterThan(0.5);
    });

    it('returns 0.5 when total weight is zero', () => {
      const components = [makeComponent(0.6, 0, 0), makeComponent(0.4, 0, 0)];

      expect(service.voting(components)).toBe(0.5);
    });
  });

  // ─── stacking ────────────────────────────────────────────────────────────

  describe('stacking', () => {
    it('returns value between 0 and 1', () => {
      const components = [makeComponent(0.6, 0.5), makeComponent(0.7, 0.5)];

      const result = service.stacking(components);

      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(1);
    });

    it('returns ~0.5 for balanced equal probabilities', () => {
      // logit(0.5) = 0, so weighted avg logit = 0, sigmoid(0) = 0.5
      const components = [makeComponent(0.5, 1.0), makeComponent(0.5, 1.0)];

      expect(service.stacking(components)).toBeCloseTo(0.5, 2);
    });

    it('uses provided metaWeights when passed', () => {
      const components = [makeComponent(0.3, 0.5), makeComponent(0.7, 0.5)];
      const metaWeights = [0.9, 0.1];

      const result = service.stacking(components, metaWeights);

      // With metaWeights heavily favoring 0.3, result should be < 0.5
      expect(result).toBeLessThan(0.5);
    });
  });

  // ─── boosting ────────────────────────────────────────────────────────────

  describe('boosting', () => {
    it('returns value between 0 and 1', () => {
      const components = [
        makeComponent(0.6, 0.4),
        makeComponent(0.7, 0.3),
        makeComponent(0.5, 0.3),
      ];

      const result = service.boosting(components);

      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(1);
    });

    it('returns 0.5 when all components have zero weight', () => {
      const components = [makeComponent(0.8, 0), makeComponent(0.3, 0)];

      expect(service.boosting(components)).toBe(0.5);
    });
  });

  // ─── applyStrategy ───────────────────────────────────────────────────────

  describe('applyStrategy', () => {
    const components = [makeComponent(0.6, 0.5), makeComponent(0.4, 0.5)];

    it('delegates to weightedAverage for WEIGHTED_AVERAGE', () => {
      const spy = jest.spyOn(service, 'weightedAverage');
      service.applyStrategy('WEIGHTED_AVERAGE', components);
      expect(spy).toHaveBeenCalledWith(components);
    });

    it('delegates to voting for VOTING', () => {
      const spy = jest.spyOn(service, 'voting');
      service.applyStrategy('VOTING', components);
      expect(spy).toHaveBeenCalledWith(components);
    });

    it('delegates to stacking for STACKING', () => {
      const spy = jest.spyOn(service, 'stacking');
      service.applyStrategy('STACKING', components);
      expect(spy).toHaveBeenCalledWith(components);
    });

    it('delegates to boosting for BOOSTING', () => {
      const spy = jest.spyOn(service, 'boosting');
      service.applyStrategy('BOOSTING', components);
      expect(spy).toHaveBeenCalledWith(components);
    });
  });

  // ─── calcConfidence ───────────────────────────────────────────────────────

  describe('calcConfidence', () => {
    it('returns 0 when no components', () => {
      expect(service.calcConfidence([], 0.5)).toBe(0);
    });

    it('returns high confidence when all agree', () => {
      const components = [
        makeComponent(0.7, 1.0, 0.9),
        makeComponent(0.7, 1.0, 0.9),
      ];

      const result = service.calcConfidence(components, 0.7);

      // Components perfectly agree → high agreement → high confidence
      expect(result).toBeGreaterThan(0.7);
    });

    it('returns lower confidence when components disagree', () => {
      const components = [
        makeComponent(0.2, 1.0, 0.8),
        makeComponent(0.8, 1.0, 0.8),
      ];

      const agree = service.calcConfidence(components, 0.5);
      const disagree = service.calcConfidence([makeComponent(0.5, 1.0, 0.8), makeComponent(0.5, 1.0, 0.8)], 0.5);

      expect(agree).toBeLessThan(disagree);
    });
  });

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('throws NotFoundException when ensemble not found', async () => {
      prismaStub.ensembleModel.findFirst.mockResolvedValue(null);

      await expect(service.findOne('nonexistent', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('returns ensemble when found', async () => {
      const ensemble = { id: 'ensemble-1', userId: 'user-1', components: [] };
      prismaStub.ensembleModel.findFirst.mockResolvedValue(ensemble);

      const result = await service.findOne('ensemble-1', 'user-1');

      expect(result.id).toBe('ensemble-1');
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when ensemble not found', async () => {
      prismaStub.ensembleModel.findFirst.mockResolvedValue(null);

      await expect(service.remove('nonexistent', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('deletes components then ensemble and returns message', async () => {
      const ensemble = { id: 'ensemble-1', userId: 'user-1', components: [] };
      prismaStub.ensembleModel.findFirst.mockResolvedValue(ensemble);

      const result = await service.remove('ensemble-1', 'user-1');

      expect(prismaStub.ensembleComponent.deleteMany).toHaveBeenCalledWith({
        where: { ensembleModelId: 'ensemble-1' },
      });
      expect(prismaStub.ensembleModel.delete).toHaveBeenCalled();
      expect(result.message).toContain('deleted');
    });
  });
});
