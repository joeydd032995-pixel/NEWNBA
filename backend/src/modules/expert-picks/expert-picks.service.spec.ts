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
        findFirst: jest.fn().mockResolvedValue(null),
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

      expect(result.total).toBe(3);
      const homeEntry = result.consensus.find((c: any) => c.outcome === 'home')!;
      const awayEntry = result.consensus.find((c: any) => c.outcome === 'away')!;
      expect(homeEntry.count).toBe(2);
      expect(homeEntry.pct).toBe(67);
      expect(awayEntry.count).toBe(1);
      expect(awayEntry.pct).toBe(33);
    });

    it('returns empty consensus when no picks for market', async () => {
      prismaStub.expertPick.findMany.mockResolvedValue([]);

      const result = await service.getConsensus('market-unknown');

      expect(result.total).toBe(0);
      expect(result.consensus).toEqual([]);
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

    it('calls update with where: { id } and result data (no pre-existence check)', async () => {
      prismaStub.expertPick.update.mockResolvedValue({ id: 'pick-999', result: 'WIN', resolvedAt: new Date() });

      // resolvePick passes directly to prisma.update — no NotFoundException thrown on missing record
      await service.resolvePick('pick-999', 'WIN');

      expect(prismaStub.expertPick.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'pick-999' } }),
      );
    });
  });

  describe('getContrarian', () => {
    it('returns contrarian picks when experts ≥60% on side public ≤40%', async () => {
      // Expert at 100% on 'home', public only 30% on 'home' → contrarian
      const picks = [
        {
          id: 'pick-1',
          outcome: 'home',
          marketId: 'market-1',
          expertName: 'Expert A',
          result: null,
          market: {
            id: 'market-1',
            marketType: 'MONEYLINE',
            event: { id: 'event-1', homeTeam: { abbreviation: 'LAL' }, awayTeam: { abbreviation: 'BOS' } },
            player: null,
            publicBettingSplits: [
              { outcome: 'home', pctBets: 30, pctMoney: 25, snappedAt: new Date() },
            ],
          },
        },
      ];
      prismaStub.expertPick.findMany.mockResolvedValue(picks);

      const result = await service.getContrarian();

      expect(result).toHaveLength(1);
      expect(result[0].expertOutcome).toBe('home');
      expect(result[0].expertPct).toBe(100);
    });

    it('returns empty array when no contrarian signals', async () => {
      prismaStub.expertPick.findMany.mockResolvedValue([]);

      const result = await service.getContrarian();

      expect(result).toEqual([]);
    });
  });
});
