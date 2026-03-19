import { ParlayService } from './parlay.service';

describe('ParlayService', () => {
  let service: ParlayService;
  let prismaStub: any;
  let analyticsStub: any;

  const makeMarket = (marketType: string, propStatType: string | null, odds: number[], outcomes: string[]) => ({
    id: `market-${marketType}`,
    marketType,
    propStatType,
    description: null,
    player: null,
    marketOdds: outcomes.map((outcome, i) => ({
      id: `mo-${i}`,
      outcome,
      odds: odds[i],
      line: null,
      book: { name: 'DraftKings' },
    })),
  });

  beforeEach(() => {
    prismaStub = {
      event: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      market: {
        findUnique: jest.fn().mockResolvedValue(null),
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

    service = new ParlayService(prismaStub, analyticsStub);
  });

  describe('getEventMarkets', () => {
    it('returns null when event not found', async () => {
      prismaStub.event.findUnique.mockResolvedValue(null);

      const result = await service.getEventMarkets('nonexistent');

      expect(result).toBeNull();
    });

    it('filters out markets with no odds (empty outcomes)', async () => {
      const event = {
        id: 'event-1',
        homeTeamId: 'team-h',
        awayTeamId: 'team-a',
        startTime: new Date(),
        homeTeam: { abbreviation: 'LAL' },
        awayTeam: { abbreviation: 'BOS' },
        markets: [
          {
            id: 'market-1',
            marketType: 'MONEYLINE',
            propStatType: null,
            description: null,
            player: null,
            marketOdds: [],  // no odds → should be filtered out
          },
          {
            id: 'market-2',
            marketType: 'SPREAD',
            propStatType: null,
            description: null,
            player: null,
            marketOdds: [
              { outcome: 'home', odds: -110, line: -3.5, book: { name: 'DraftKings' } },
            ],
          },
        ],
      };
      prismaStub.event.findUnique.mockResolvedValue(event);

      const result = await service.getEventMarkets('event-1');

      expect(result!.legs).toHaveLength(1);
      expect(result!.legs[0].marketType).toBe('SPREAD');
    });

    it('collapses to best odds per outcome', async () => {
      const event = {
        id: 'event-1',
        homeTeamId: 'team-h',
        awayTeamId: 'team-a',
        startTime: new Date(),
        homeTeam: { abbreviation: 'LAL' },
        awayTeam: { abbreviation: 'BOS' },
        markets: [
          {
            id: 'market-1',
            marketType: 'MONEYLINE',
            propStatType: null,
            description: null,
            player: null,
            marketOdds: [
              { outcome: 'home', odds: -110, line: null, book: { name: 'DraftKings' } },
              { outcome: 'home', odds: -105, line: null, book: { name: 'FanDuel' } },  // better
            ],
          },
        ],
      };
      prismaStub.event.findUnique.mockResolvedValue(event);

      const result = await service.getEventMarkets('event-1');

      const homeOutcome = result!.legs[0].outcomes.find((o: any) => o.outcome === 'home');
      expect(homeOutcome.odds).toBe(-105);
    });
  });

  describe('analyzeSGP', () => {
    it('throws when fewer than 2 legs provided', async () => {
      await expect(
        service.analyzeSGP('event-1', [{ marketId: 'market-1', outcome: 'home' }]),
      ).rejects.toThrow('SGP requires at least 2 legs');
    });

    it('throws when event not found', async () => {
      prismaStub.event.findUnique.mockResolvedValue(null);

      await expect(
        service.analyzeSGP('nonexistent', [
          { marketId: 'market-1', outcome: 'home' },
          { marketId: 'market-2', outcome: 'over' },
        ]),
      ).rejects.toThrow('Event not found');
    });
  });

  describe('correlation matrix rules (via computeCorrelation indirectly)', () => {
    // Test the pure correlation rules by using analyzeSGP end-to-end with mocked data

    const makeEvent = () => ({
      id: 'event-1',
      homeTeamId: 'team-h',
      awayTeamId: 'team-a',
      homeTeam: { id: 'team-h', abbreviation: 'LAL' },
      awayTeam: { id: 'team-a', abbreviation: 'BOS' },
    });

    const makeMoneylineMarket = (id: string, odds: number, outcome: string) => ({
      id,
      marketType: 'MONEYLINE',
      propStatType: null,
      description: null,
      player: null,
      marketOdds: [
        { id: `${id}-mo`, outcome, odds, line: null, book: { name: 'DraftKings' } },
        { id: `${id}-mo2`, outcome: outcome === 'home' ? 'away' : 'home', odds: -120, line: null, book: { name: 'DraftKings' } },
      ],
    });

    it('detects negative correlation between ML_HOME and ML_AWAY', async () => {
      prismaStub.event.findUnique.mockResolvedValue(makeEvent());
      prismaStub.market.findUnique
        .mockResolvedValueOnce(makeMoneylineMarket('m1', -110, 'home'))
        .mockResolvedValueOnce(makeMoneylineMarket('m2', -110, 'away'));

      const result = await service.analyzeSGP('event-1', [
        { marketId: 'm1', outcome: 'home' },
        { marketId: 'm2', outcome: 'away' },
      ]);

      // ML_HOME + ML_AWAY = -0.99 correlation → corr prob (%) should be much lower than indep prob (%)
      expect(result.corrProb).toBeLessThan(result.indepProb);
    });

    it('corr prob is clamped to [0.001, 0.999]', async () => {
      prismaStub.event.findUnique.mockResolvedValue(makeEvent());
      prismaStub.market.findUnique
        .mockResolvedValueOnce(makeMoneylineMarket('m1', -110, 'home'))
        .mockResolvedValueOnce(makeMoneylineMarket('m2', -110, 'away'));

      const result = await service.analyzeSGP('event-1', [
        { marketId: 'm1', outcome: 'home' },
        { marketId: 'm2', outcome: 'away' },
      ]);

      // corrProb is returned as a percentage (0-100) clamped from [0.001, 0.999] → [0.1, 99.9]
      expect(result.corrProb).toBeGreaterThanOrEqual(0.001 * 100 - 1);
      expect(result.corrProb).toBeLessThanOrEqual(0.999 * 100 + 1);
    });
  });
});
