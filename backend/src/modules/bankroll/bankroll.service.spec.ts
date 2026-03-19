import { BankrollService } from './bankroll.service';
import { AnalyticsService } from '../analytics/analytics.service';

describe('BankrollService', () => {
  let service: BankrollService;
  let analyticsStub: any;
  let evServiceStub: any;
  let prismaStub: any;

  beforeEach(() => {
    prismaStub = {
      betSlip: {
        findMany: jest.fn(),
      },
    };

    analyticsStub = {
      calcEV: jest.fn().mockReturnValue({
        ev: 5.0,
        evPct: 5.0,
        kellyFraction: 0.05,
        impliedProb: 0.5238,
        isPositiveEV: true,
      }),
    };

    evServiceStub = {
      getEVFeed: jest.fn().mockResolvedValue([]),
    };

    service = new BankrollService(prismaStub, analyticsStub, evServiceStub);
  });

  // ─── calcKelly ──────────────────────────────────────────────
  describe('calcKelly', () => {
    it('computes correct stake = bankroll × kellyFull × fraction', () => {
      // Mock analytics to return kellyFraction = 0.1
      analyticsStub.calcEV.mockReturnValue({
        ev: 10,
        evPct: 10,
        kellyFraction: 0.1,
        impliedProb: 0.5238,
        isPositiveEV: true,
      });

      const result = service.calcKelly(1000, -110, 0.6, 0.25);

      // stake = 1000 × 0.1 × 0.25 = 25
      expect(result.kellyFull).toBe(0.1);
      expect(result.kellyFractional).toBeCloseTo(0.025, 5);
      expect(result.stake).toBe(25);
    });

    it('rounds stake to 2 decimal places', () => {
      analyticsStub.calcEV.mockReturnValue({
        ev: 3.7,
        evPct: 3.7,
        kellyFraction: 0.0333,
        impliedProb: 0.524,
        isPositiveEV: true,
      });

      const result = service.calcKelly(1000, -110, 0.55, 0.25);

      // stake = 1000 × 0.0333 × 0.25 = 8.325 → rounds to 8.33
      expect(result.stake).toBe(Math.round(1000 * 0.0333 * 0.25 * 100) / 100);
    });

    it('returns ev and evPct from analytics service', () => {
      analyticsStub.calcEV.mockReturnValue({
        ev: 7.5,
        evPct: 7.5,
        kellyFraction: 0.08,
        impliedProb: 0.52,
        isPositiveEV: true,
      });

      const result = service.calcKelly(500, 110, 0.58, 0.5);

      expect(result.ev).toBe(7.5);
      expect(result.evPct).toBe(7.5);
    });
  });

  // ─── getPortfolio ──────────────────────────────────────────
  describe('getPortfolio', () => {
    it('returns empty portfolio when no positive EV bets', async () => {
      evServiceStub.getEVFeed.mockResolvedValue([]);

      const result = await service.getPortfolio(1000, 0.25);

      expect(result.bets).toEqual([]);
      expect(result.totalStake).toBe(0);
      expect(result.betsAtRisk).toBe(0);
    });

    it('applies sqrt(N) scaling to Kelly fractions', async () => {
      // 4 bets → sqrtN = 2
      const feed = Array.from({ length: 4 }, (_, i) => ({
        marketOddsId: `odds-${i}`,
        market: { event: { homeTeam: { abbreviation: 'LAL' }, awayTeam: { abbreviation: 'BOS' } } },
        outcome: 'home',
        odds: -110,
        bookName: 'DraftKings',
        trueProb: 0.55,
        ev: 5.0,
        evPct: 5.0,
        kellyFraction: 0.08,
      }));
      evServiceStub.getEVFeed.mockResolvedValue(feed);

      const result = await service.getPortfolio(1000, 0.25);

      // stake per bet = 1000 × (0.08 × 0.25) / sqrt(4) = 1000 × 0.02 / 2 = 10
      expect(result.bets).toHaveLength(4);
      expect(result.bets[0].recommendedStake).toBe(10);
    });

    it('caps individual bet at 5% of bankroll', async () => {
      // Single bet with enormous kelly fraction → capped at 5%
      evServiceStub.getEVFeed.mockResolvedValue([
        {
          marketOddsId: 'odds-1',
          market: { event: { homeTeam: { abbreviation: 'LAL' }, awayTeam: { abbreviation: 'BOS' } } },
          outcome: 'home',
          odds: 200,
          bookName: 'FanDuel',
          trueProb: 0.75,
          ev: 50.0,
          evPct: 50.0,
          kellyFraction: 0.9, // very large
        },
      ]);

      const bankroll = 1000;
      const result = await service.getPortfolio(bankroll, 1.0);

      // Cap is 5% = $50
      expect(result.bets[0].recommendedStake).toBeLessThanOrEqual(bankroll * 0.05);
    });
  });

  // ─── getStats ──────────────────────────────────────────────
  describe('getStats', () => {
    it('calculates correct ROI from won/lost slips', async () => {
      const slips = [
        {
          status: 'WON',
          totalStake: 100,
          totalOdds: 2.0,
          items: [{ stake: 100 }],
          createdAt: new Date('2024-01-01'),
        },
        {
          status: 'LOST',
          totalStake: 100,
          totalOdds: null,
          items: [{ stake: 100 }],
          createdAt: new Date('2024-01-02'),
        },
      ];
      prismaStub.betSlip.findMany.mockResolvedValue(slips);

      const result = await service.getStats();

      // totalReturned = 100 * 2.0 = 200
      // totalStaked = 200
      // ROI = (200 - 200) / 200 = 0
      expect(result.won).toBe(1);
      expect(result.lost).toBe(1);
      expect(result.roi).toBe(0);
    });

    it('tracks win/loss streaks correctly', async () => {
      const slips = [
        {
          status: 'WON',
          totalStake: 50,
          totalOdds: 2.0,
          items: [],
          createdAt: new Date('2024-01-01'),
        },
        {
          status: 'WON',
          totalStake: 50,
          totalOdds: 2.0,
          items: [],
          createdAt: new Date('2024-01-02'),
        },
        {
          status: 'WON',
          totalStake: 50,
          totalOdds: 2.0,
          items: [],
          createdAt: new Date('2024-01-03'),
        },
      ];
      prismaStub.betSlip.findMany.mockResolvedValue(slips);

      const result = await service.getStats();

      expect(result.currentStreak).toBe(3);
      expect(result.streakType).toBe('W');
    });

    it('returns zero ROI when no slips', async () => {
      prismaStub.betSlip.findMany.mockResolvedValue([]);

      const result = await service.getStats();

      expect(result.totalBets).toBe(0);
      expect(result.roi).toBe(0);
      expect(result.sharpe).toBe(0);
    });

    it('calculates max drawdown from bankroll series', async () => {
      // Peak at 1100, then drop to 900 → drawdown = (1100-900)/1100 ≈ 0.182
      const slips = [
        { status: 'WON', totalStake: 100, totalOdds: 2.0, items: [], createdAt: new Date('2024-01-01') },
        { status: 'LOST', totalStake: 200, totalOdds: null, items: [], createdAt: new Date('2024-01-02') },
      ];
      prismaStub.betSlip.findMany.mockResolvedValue(slips);

      const result = await service.getStats();

      expect(result.maxDrawdown).toBeGreaterThan(0);
    });
  });
});
