import { EVService } from './ev.service';
import { AnalyticsService } from '../analytics/analytics.service';

describe('EVService', () => {
  let service: EVService;
  let prismaStub: any;
  let analyticsStub: any;
  let cacheStub: any;

  beforeEach(() => {
    prismaStub = {
      marketOdds: {
        findMany: jest.fn(),
      },
      market: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue({ id: 'market-1', eventId: 'event-1' }),
      },
      eVMetrics: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
      },
      publicBettingSplit: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    analyticsStub = {
      removeVig: jest.fn().mockReturnValue([0.5238, 0.4762]),
      calcEV: jest.fn().mockReturnValue({
        ev: 5.0,
        evPct: 5.0,
        kellyFraction: 0.05,
        impliedProb: 0.5238,
        isPositiveEV: true,
      }),
    };

    cacheStub = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      reset: jest.fn().mockResolvedValue(undefined),
    };

    service = new EVService(prismaStub, analyticsStub, cacheStub);
  });

  describe('calculateEVForMarket', () => {
    it('returns empty array when no market odds found', async () => {
      prismaStub.marketOdds.findMany.mockResolvedValue([]);

      const result = await service.calculateEVForMarket('market-1');

      expect(result).toEqual([]);
    });

    it('selects best odds per outcome (max odds across books)', async () => {
      const odds = [
        { id: 'mo-1', marketId: 'market-1', outcome: 'home', odds: -110, isOpen: true, book: { name: 'DraftKings' } },
        { id: 'mo-2', marketId: 'market-1', outcome: 'home', odds: -105, isOpen: true, book: { name: 'FanDuel' } },
        { id: 'mo-3', marketId: 'market-1', outcome: 'away', odds: -110, isOpen: true, book: { name: 'BetMGM' } },
      ];
      prismaStub.marketOdds.findMany.mockResolvedValue(odds);

      await service.calculateEVForMarket('market-1');

      // Should call removeVig with best odds per outcome: -105 (home) and -110 (away)
      expect(analyticsStub.removeVig).toHaveBeenCalledWith([-105, -110]);
    });

    it('only returns positive EV results (isPositiveEV=true)', async () => {
      const odds = [
        { id: 'mo-1', marketId: 'market-1', outcome: 'home', odds: -110, isOpen: true, book: { name: 'DraftKings' } },
        { id: 'mo-2', marketId: 'market-1', outcome: 'away', odds: -110, isOpen: true, book: { name: 'FanDuel' } },
      ];
      prismaStub.marketOdds.findMany.mockResolvedValue(odds);
      analyticsStub.calcEV
        .mockReturnValueOnce({ ev: 3, evPct: 3, kellyFraction: 0.03, impliedProb: 0.52, isPositiveEV: true })
        .mockReturnValueOnce({ ev: -2, evPct: -2, kellyFraction: 0, impliedProb: 0.52, isPositiveEV: false });

      const result = await service.calculateEVForMarket('market-1');

      expect(result).toHaveLength(1);
      expect(result[0].outcome).toBe('home');
    });

    it('uses passed trueProbs when provided', async () => {
      const odds = [
        { id: 'mo-1', marketId: 'market-1', outcome: 'home', odds: -110, isOpen: true, book: { name: 'DraftKings' } },
      ];
      prismaStub.marketOdds.findMany.mockResolvedValue(odds);

      await service.calculateEVForMarket('market-1', { home: 0.6 });

      // calcEV should be called with the provided true probability (0.6), not the no-vig one
      expect(analyticsStub.calcEV).toHaveBeenCalledWith(0.6, -110);
    });

    it('saves EVMetrics to DB for positive EV results', async () => {
      const odds = [
        { id: 'mo-1', marketId: 'market-1', outcome: 'home', odds: -110, isOpen: true, book: { name: 'DraftKings' } },
      ];
      prismaStub.marketOdds.findMany.mockResolvedValue(odds);

      await service.calculateEVForMarket('market-1');

      expect(prismaStub.eVMetrics.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            marketId: 'market-1',
            outcome: 'home',
            bookOdds: -110,
          }),
        }),
      );
    });
  });

  describe('getEVFeed', () => {
    it('returns cached result on cache hit (non-empty cache)', async () => {
      const cachedData = [{ id: 'ev-1', evPct: 8 }];
      cacheStub.get.mockResolvedValue(cachedData);

      const result = await service.getEVFeed({ minEV: 3 });

      expect(result).toEqual(cachedData);
      expect(prismaStub.eVMetrics.findMany).not.toHaveBeenCalled();
    });

    it('queries DB on cache miss and caches the result', async () => {
      cacheStub.get.mockResolvedValue(null);
      const dbResults = [
        {
          id: 'ev-1',
          marketId: 'market-1',
          outcome: 'home',
          evPct: 5,
          market: { event: { homeTeam: {}, awayTeam: {} }, sport: {} },
        },
      ];
      prismaStub.eVMetrics.findMany.mockResolvedValue(dbResults);

      await service.getEVFeed({ minEV: 3 });

      expect(prismaStub.eVMetrics.findMany).toHaveBeenCalled();
      expect(cacheStub.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        30,
      );
    });

    it('skips cache when cache returns empty array (stale signal)', async () => {
      cacheStub.get.mockResolvedValue([]);
      prismaStub.eVMetrics.findMany.mockResolvedValue([]);

      await service.getEVFeed({});

      expect(prismaStub.eVMetrics.findMany).toHaveBeenCalled();
    });
  });
});
