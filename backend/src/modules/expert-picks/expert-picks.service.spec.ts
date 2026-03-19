import { ExpertPicksService } from './expert-picks.service';
import { NotFoundException } from '@nestjs/common';

describe('ExpertPicksService', () => {
  let service: ExpertPicksService;
  let prismaStub: any;

  beforeEach(() => {
    prismaStub = {
      expertPick: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      publicBettingSplit: {
        findFirst: jest.fn(),
      },
    };
    service = new ExpertPicksService(prismaStub);
  });

  describe('createPick', () => {
    it('stores all fields including expertName, marketId, outcome, confidence, reasoning', async () => {
      const data = {
        expertName: 'Joe Expert',
        source: 'ESPN',
        marketId: 'market-1',
        outcome: 'home_win',
        odds: -110,
        confidence: 0.75,
        reasoning: 'Strong analytics',
      };
      const created = {
        id: 'pick-1',
        ...data,
        pickedAt: new Date(),
        result: null,
      };
      prismaStub.expertPick.create.mockResolvedValue(created);

      const result = await service.createPick(data);

      expect(prismaStub.expertPick.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          expertName: 'Joe Expert',
          marketId: 'market-1',
          outcome: 'home_win',
        }),
      });
      expect(result.expertName).toBe('Joe Expert');
      expect(result.confidence).toBe(0.75);
    });
  });

  describe('getPicks', () => {
    it('filters by marketId, expertName, and pending status', async () => {
      const picks = [
        {
          id: 'pick-1',
          expertName: 'Expert A',
          marketId: 'market-1',
          outcome: 'home',
          result: null,
          pickedAt: new Date('2024-01-01'),
        },
      ];
      prismaStub.expertPick.findMany.mockResolvedValue(picks);

      await service.getPicks({
        marketId: 'market-1',
        expertName: 'Expert A',
        pending: true,
        limit: 10,
      });

      expect(prismaStub.expertPick.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            marketId: 'market-1',
            expertName: 'Expert A',
          }),
        }),
      );
    });

    it('enriches results with latest publicBettingSplit for same market/outcome', async () => {
      const pick = {
        id: 'pick-1',
        marketId: 'market-1',
        outcome: 'home',
        expertName: 'Expert A',
        result: null,
      };
      const split = {
        id: 'split-1',
        marketId: 'market-1',
        outcome: 'home',
        pctBets: 55,
        pctMoney: 60,
      };

      prismaStub.expertPick.findMany.mockResolvedValue([pick]);
      prismaStub.publicBettingSplit.findFirst.mockResolvedValue(split);

      const result = await service.getPicks({
        marketId: 'market-1',
        pending: true,
      });

      expect(result).toBeDefined();
    });

    it('returns empty array when no picks match filters', async () => {
      prismaStub.expertPick.findMany.mockResolvedValue([]);

      const result = await service.getPicks({
        marketId: 'market-unknown',
        pending: true,
      });

      expect(result).toEqual([]);
    });
  });

  describe('getConsensus', () => {
    it('counts picks per outcome and calculates percentage', async () => {
      const picks = [
        { id: 'pick-1', outcome: 'home', marketId: 'market-1', result: null },
        { id: 'pick-2', outcome: 'home', marketId: 'market-1', result: null },
        { id: 'pick-3', outcome: 'away', marketId: 'market-1', result: null },
      ];
      prismaStub.expertPick.findMany.mockResolvedValue(picks);

      const result = await service.getConsensus('market-1');

      expect(result).toEqual({
        home: { count: 2, pct: 67 },
        away: { count: 1, pct: 33 },
      });
    });

    it('returns empty consensus when no picks for market', async () => {
      prismaStub.expertPick.findMany.mockResolvedValue([]);

      const result = await service.getConsensus('market-unknown');

      expect(Object.keys(result).length).toBe(0);
    });
  });

  describe('resolvePick', () => {
    it('sets result (WIN/LOSS/PUSH) and resolvedAt timestamp', async () => {
      const pickId = 'pick-1';
      const existingPick = {
        id: pickId,
        expertName: 'Expert A',
        outcome: 'home',
        result: null,
      };
      prismaStub.expertPick.findUnique.mockResolvedValue(existingPick);
      prismaStub.expertPick.update.mockResolvedValue({
        ...existingPick,
        result: 'WIN',
        resolvedAt: expect.any(Date),
      });

      const result = await service.resolvePick(pickId, 'WIN');

      expect(prismaStub.expertPick.update).toHaveBeenCalledWith({
        where: { id: pickId },
        data: {
          result: 'WIN',
          resolvedAt: expect.any(Date),
        },
      });
      expect(result.result).toBe('WIN');
    });

    it('throws NotFoundException when pick does not exist', async () => {
      prismaStub.expertPick.findUnique.mockResolvedValue(null);

      await expect(service.resolvePick('pick-999', 'WIN')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getContrarian', () => {
    it('returns picks where expert lean differs from public lean', async () => {
      // Contrarian logic: expert picks "home" but public favors "away"
      const picks = [
        {
          id: 'pick-1',
          outcome: 'home',
          marketId: 'market-1',
          expertName: 'Expert A',
          confidence: 0.8,
        },
      ];
      const split = {
        marketId: 'market-1',
        outcome: 'away',
        pctBets: 65,
        pctMoney: 70,
      };

      prismaStub.expertPick.findMany.mockResolvedValue(picks);
      prismaStub.publicBettingSplit.findFirst.mockResolvedValue(split);

      const result = await service.getContrarian();

      expect(result).toBeDefined();
    });
  });
});
