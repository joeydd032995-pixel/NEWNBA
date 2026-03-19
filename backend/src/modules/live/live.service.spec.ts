import { LiveService } from './live.service';

describe('LiveService', () => {
  let service: LiveService;
  let prismaStub: any;
  let analyticsStub: any;

  const makeEvent = (overrides: any = {}) => ({
    id: 'event-1',
    homeScore: 60,
    awayScore: 50,
    period: 3,
    timeRemaining: '5:00',
    status: 'LIVE',
    startTime: new Date(),
    homeTeam: { id: 'team-h', name: 'Lakers', abbreviation: 'LAL' },
    awayTeam: { id: 'team-a', name: 'Celtics', abbreviation: 'BOS' },
    markets: [],
    ...overrides,
  });

  beforeEach(() => {
    prismaStub = {
      event: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      oddsHistory: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    analyticsStub = {
      removeVig: jest.fn().mockReturnValue([0.52, 0.48]),
      calcEV: jest.fn().mockReturnValue({
        ev: 2.0,
        evPct: 2.0,
        kellyFraction: 0.02,
        impliedProb: 0.52,
        isPositiveEV: true,
      }),
    };

    service = new LiveService(prismaStub, analyticsStub);
  });

  describe('getLiveGames', () => {
    it('returns empty array when no live events', async () => {
      prismaStub.event.findMany.mockResolvedValue([]);

      const result = await service.getLiveGames();

      expect(result).toEqual([]);
    });

    it('calculates homePct as share of scoring (60 home, 50 away → 55%)', async () => {
      prismaStub.event.findMany.mockResolvedValue([makeEvent()]);

      const result = await service.getLiveGames();

      // 60 / (60+50) = 0.5454... → rounded to 55
      expect(result[0].momentum.homePct).toBe(55);
    });

    it('returns homePct=50 when no scoring yet (0-0)', async () => {
      prismaStub.event.findMany.mockResolvedValue([makeEvent({ homeScore: 0, awayScore: 0 })]);

      const result = await service.getLiveGames();

      expect(result[0].momentum.homePct).toBe(50);
    });

    it('classifies favoredTeam=home when diff > 4', async () => {
      // homeScore 60, awayScore 50 → diff = 10 > 4
      prismaStub.event.findMany.mockResolvedValue([makeEvent({ homeScore: 60, awayScore: 50 })]);

      const result = await service.getLiveGames();

      expect(result[0].momentum.favoredTeam).toBe('home');
    });

    it('classifies favoredTeam=away when diff < -4', async () => {
      prismaStub.event.findMany.mockResolvedValue([makeEvent({ homeScore: 40, awayScore: 60 })]);

      const result = await service.getLiveGames();

      expect(result[0].momentum.favoredTeam).toBe('away');
    });

    it('classifies favoredTeam=even when diff within [-4, 4]', async () => {
      prismaStub.event.findMany.mockResolvedValue([makeEvent({ homeScore: 50, awayScore: 52 })]);

      const result = await service.getLiveGames();

      expect(result[0].momentum.favoredTeam).toBe('even');
    });

    it('includes event metadata (teams, scores, status)', async () => {
      prismaStub.event.findMany.mockResolvedValue([makeEvent()]);

      const result = await service.getLiveGames();

      expect(result[0].event.homeTeam.abbr).toBe('LAL');
      expect(result[0].event.awayTeam.abbr).toBe('BOS');
      expect(result[0].event.homeScore).toBe(60);
      expect(result[0].event.awayScore).toBe(50);
      expect(result[0].event.status).toBe('LIVE');
    });

    it('enriches markets with EV via analytics service', async () => {
      const market = {
        id: 'market-1',
        marketType: 'MONEYLINE',
        marketOdds: [
          { id: 'mo-1', outcome: 'home', odds: -110, line: null, book: { name: 'DraftKings' } },
          { id: 'mo-2', outcome: 'away', odds: -110, line: null, book: { name: 'FanDuel' } },
        ],
      };
      prismaStub.event.findMany.mockResolvedValue([makeEvent({ markets: [market] })]);

      const result = await service.getLiveGames();

      expect(analyticsStub.removeVig).toHaveBeenCalled();
      expect(result[0].markets).toHaveLength(1);
      expect(result[0].markets[0].outcomes).toHaveLength(2);
    });

    it('collapses to best odds per outcome across books', async () => {
      const market = {
        id: 'market-1',
        marketType: 'MONEYLINE',
        marketOdds: [
          { id: 'mo-1', outcome: 'home', odds: -110, line: null, book: { name: 'DraftKings' } },
          { id: 'mo-2', outcome: 'home', odds: -105, line: null, book: { name: 'FanDuel' } },
        ],
      };
      prismaStub.event.findMany.mockResolvedValue([makeEvent({ markets: [market] })]);

      const result = await service.getLiveGames();

      // Should use best odds (-105 > -110 in American odds)
      const homeOutcome = result[0].markets[0].outcomes.find((o: any) => o.outcome === 'home');
      expect(homeOutcome.odds).toBe(-105);
    });
  });

  describe('getLineMovements', () => {
    it('returns empty array when no recent history', async () => {
      prismaStub.oddsHistory.findMany.mockResolvedValue([]);

      const result = await service.getLineMovements(3);

      expect(result).toEqual([]);
    });

    it('filters line movements below threshold', async () => {
      // -110 → -112: tiny move (< 3%)
      const history = [
        {
          marketOddsId: 'mo-1',
          odds: -110,
          recordedAt: new Date(),
          marketOdds: {
            id: 'mo-1',
            odds: -112,
            outcome: 'home',
            market: {
              id: 'market-1',
              marketType: 'MONEYLINE',
              event: {
                id: 'event-1',
                homeTeam: { abbreviation: 'LAL' },
                awayTeam: { abbreviation: 'BOS' },
                status: 'LIVE',
                homeScore: 50,
                awayScore: 45,
                period: 3,
              },
              player: null,
            },
            book: { name: 'DraftKings' },
          },
        },
      ];
      prismaStub.oddsHistory.findMany.mockResolvedValue(history);

      const result = await service.getLineMovements(3);

      expect(result).toEqual([]);
    });

    it('detects significant line movements and sorts by movePct desc', async () => {
      // -110 → +105: large move (significant)
      const history = [
        {
          marketOddsId: 'mo-1',
          odds: -110,
          recordedAt: new Date(),
          marketOdds: {
            id: 'mo-1',
            odds: 105,
            outcome: 'home',
            market: {
              id: 'market-1',
              marketType: 'MONEYLINE',
              event: {
                id: 'event-1',
                homeTeam: { abbreviation: 'LAL' },
                awayTeam: { abbreviation: 'BOS' },
                status: 'LIVE',
                homeScore: 50,
                awayScore: 45,
                period: 3,
              },
              player: null,
            },
            book: { name: 'DraftKings' },
          },
        },
      ];
      prismaStub.oddsHistory.findMany.mockResolvedValue(history);

      const result = await service.getLineMovements(3);

      expect(result).toHaveLength(1);
      expect(result[0].marketOddsId).toBe('mo-1');
      expect(result[0].movePct).toBeGreaterThan(3);
    });

    it('deduplicates movements (first occurrence per marketOddsId)', async () => {
      const entry = {
        marketOddsId: 'mo-1',
        odds: -110,
        recordedAt: new Date(),
        marketOdds: {
          id: 'mo-1',
          odds: 105,
          outcome: 'home',
          market: {
            id: 'market-1',
            marketType: 'MONEYLINE',
            event: {
              id: 'event-1',
              homeTeam: { abbreviation: 'LAL' },
              awayTeam: { abbreviation: 'BOS' },
              status: 'LIVE',
              homeScore: 50,
              awayScore: 45,
              period: 3,
            },
            player: null,
          },
          book: { name: 'DraftKings' },
        },
      };
      prismaStub.oddsHistory.findMany.mockResolvedValue([entry, entry]);

      const result = await service.getLineMovements(3);

      expect(result).toHaveLength(1);
    });
  });
});
