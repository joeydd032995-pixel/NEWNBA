import { ParlayService } from './parlay.service';

describe('ParlayService', () => {
  let service: ParlayService;
  let prismaStub: any;
  let analyticsStub: any;

  beforeEach(() => {
    prismaStub = {
      event: { findUnique: jest.fn().mockResolvedValue(null) },
      market: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    analyticsStub = {
      removeVig: jest.fn().mockReturnValue([0.52, 0.48]),
      calcEV: jest.fn((probability: number, odds: number) => ({
        ev: probability,
        evPct: probability - 0.5,
        kellyFraction: 0,
        impliedProb: 0.5,
        isPositiveEV: probability > 0.5,
        odds,
      })),
    };
    service = new ParlayService(prismaStub, analyticsStub);
  });

  describe('getEventMarkets', () => {
    it('returns null when event not found', async () => {
      expect(await service.getEventMarkets('missing')).toBeNull();
    });

    it('keeps the best sportsbook price for each exact outcome and line', async () => {
      prismaStub.event.findUnique.mockResolvedValue({
        id: 'event-1',
        homeTeamId: 'home',
        awayTeamId: 'away',
        startTime: new Date('2026-01-01T00:00:00Z'),
        homeTeam: { abbreviation: 'LAL' },
        awayTeam: { abbreviation: 'BOS' },
        markets: [{
          id: 'market-1',
          marketType: 'PLAYER_PROP',
          propStatType: 'POINTS',
          description: 'Player points',
          player: { id: 'p1', name: 'Player', teamId: 'home', team: { abbreviation: 'LAL' } },
          marketOdds: [
            { id: 'o1', outcome: 'Over', odds: -115, line: 24.5, bookId: 'b1', book: { name: 'Book A', slug: 'book-a' } },
            { id: 'o2', outcome: 'over', odds: -105, line: 24.5, bookId: 'b2', book: { name: 'Book B', slug: 'book-b' } },
            { id: 'o3', outcome: 'over', odds: 120, line: 25.5, bookId: 'b1', book: { name: 'Book A', slug: 'book-a' } },
          ],
        }],
      });

      const result = await service.getEventMarkets('event-1');
      expect(result!.legs).toHaveLength(1);
      expect(result!.legs[0].outcomes).toHaveLength(2);
      expect(result!.legs[0].outcomes).toEqual(expect.arrayContaining([
        expect.objectContaining({ line: 24.5, odds: -105, bookId: 'b2', outcome: 'over' }),
        expect.objectContaining({ line: 25.5, odds: 120, bookId: 'b1', outcome: 'over' }),
      ]));
    });
  });

  describe('analyzeParlay', () => {
    const market = (id: string, eventId: string, outcome = 'home') => ({
      id,
      eventId,
      marketType: 'MONEYLINE',
      propStatType: null,
      event: {
        id: eventId,
        homeTeam: { abbreviation: `${eventId}-H` },
        awayTeam: { abbreviation: `${eventId}-A` },
      },
      marketOdds: [
        { id: `${id}-1`, outcome, odds: -110, line: null, bookId: 'book-1', book: { name: 'Book', slug: 'book' } },
        { id: `${id}-2`, outcome: outcome === 'home' ? 'away' : 'home', odds: -110, line: null, bookId: 'book-1', book: { name: 'Book', slug: 'book' } },
      ],
    });

    it('requires at least two legs', async () => {
      await expect(service.analyzeParlay([{ marketId: 'm1', outcome: 'home' }]))
        .rejects.toThrow('Need at least 2 legs');
    });

    it('withholds independent EV when any legs share an event', async () => {
      prismaStub.market.findUnique
        .mockResolvedValueOnce(market('m1', 'event-1'))
        .mockResolvedValueOnce(market('m2', 'event-1'));

      const result = await service.analyzeParlay([
        { marketId: 'm1', outcome: 'home' },
        { marketId: 'm2', outcome: 'home' },
      ]);

      expect(result.trueProb).toBeNull();
      expect(result.evPct).toBeNull();
      expect(result.probabilityModel).toBe('UNMODELED_SAME_EVENT_DEPENDENCE');
      expect(result.warning).toContain('/parlay/sgp/analyze');
    });

    it('uses only cross-event independent no-vig baselines for standard parlays', async () => {
      prismaStub.market.findUnique
        .mockResolvedValueOnce(market('m1', 'event-1'))
        .mockResolvedValueOnce(market('m2', 'event-2'));

      const result = await service.analyzeParlay([
        { marketId: 'm1', outcome: 'home' },
        { marketId: 'm2', outcome: 'home' },
      ]);

      expect(result.probabilityModel).toBe('CROSS_EVENT_INDEPENDENT_MARKET_NO_VIG_BASELINE');
      expect(result.trueProb).not.toBeNull();
      expect(result.evPct).not.toBeNull();
      expect(result.legs.every((leg) => leg.probabilitySource === 'MARKET_NO_VIG_BASELINE')).toBe(true);
    });
  });
});
