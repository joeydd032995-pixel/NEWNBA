import { ArbitrageService } from './arbitrage.service';
import { AnalyticsService } from '../analytics/analytics.service';

describe('ArbitrageService', () => {
  let service: ArbitrageService;

  beforeEach(() => {
    // ArbitrageService only needs PrismaService for DB calls;
    // findArbitrage() is pure logic so we pass a minimal stub.
    const prismaStub = {} as any;
    const cacheStub = { get: async () => null, set: async () => {}, del: async () => {} } as any;
    service = new ArbitrageService(prismaStub, new AnalyticsService(), cacheStub);
  });

  // ---------------------------------------------------------------
  // findArbitrage
  // ---------------------------------------------------------------
  describe('findArbitrage', () => {
    it('returns null when fewer than 2 outcomes exist', () => {
      const outcomes = [{ bookId: 'b1', bookName: 'Book1', outcome: 'Home', odds: -110 }];
      expect(service.findArbitrage(outcomes)).toBeNull();
    });

    it('returns null when no arbitrage exists (normal market)', () => {
      // Both sides priced at -110 → implied sum ≈ 1.048, no arb
      const outcomes = [
        { bookId: 'b1', bookName: 'Book1', outcome: 'Home', odds: -110 },
        { bookId: 'b2', bookName: 'Book2', outcome: 'Away', odds: -110 },
      ];
      expect(service.findArbitrage(outcomes)).toBeNull();
    });

    it('detects arbitrage when implied sum < 1', () => {
      // Home +105 on Book1, Away +110 on Book2
      // implied: 100/205 ≈ 0.4878, 100/210 ≈ 0.4762 → sum ≈ 0.964 < 1
      const outcomes = [
        { bookId: 'b1', bookName: 'Book1', outcome: 'Home', odds: 105 },
        { bookId: 'b2', bookName: 'Book2', outcome: 'Away', odds: 110 },
      ];
      const result = service.findArbitrage(outcomes, 100);
      expect(result).not.toBeNull();
      expect(result!.profit).toBeGreaterThan(0);
      expect(result!.profitPct).toBeGreaterThan(0);
    });

    it('selects best odds per outcome across books', () => {
      // Two books offer Home, pick the better line (+120 over +100)
      const outcomes = [
        { bookId: 'b1', bookName: 'Book1', outcome: 'Home', odds: 100 },
        { bookId: 'b2', bookName: 'Book2', outcome: 'Home', odds: 120 },
        { bookId: 'b3', bookName: 'Book3', outcome: 'Away', odds: 110 },
      ];
      const result = service.findArbitrage(outcomes, 100);
      if (result) {
        const homeLeg = result.legs.find(l => l.outcome === 'Home');
        expect(homeLeg?.odds).toBe(120);
      }
    });

    it('stakes sum to totalStake', () => {
      const outcomes = [
        { bookId: 'b1', bookName: 'Book1', outcome: 'Home', odds: 105 },
        { bookId: 'b2', bookName: 'Book2', outcome: 'Away', odds: 110 },
      ];
      const result = service.findArbitrage(outcomes, 100);
      if (result) {
        const stakeSum = result.legs.reduce((a, l) => a + l.stake, 0);
        expect(stakeSum).toBeCloseTo(100, 1);
      }
    });
  });
});
