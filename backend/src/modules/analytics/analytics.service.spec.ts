import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;

  beforeEach(() => {
    service = new AnalyticsService();
  });

  // ---------------------------------------------------------------
  // calcTrueShooting
  // ---------------------------------------------------------------
  describe('calcTrueShooting', () => {
    it('returns correct TS%', () => {
      // 30 pts, 20 FGA, 8 FTA → 30 / (2 * (20 + 0.475*8)) = 30 / (2 * 23.8) = 0.6302...
      const result = service.calcTrueShooting(30, 20, 8);
      expect(result).toBeCloseTo(0.6302, 3);
    });

    it('returns 0 when denominator is 0', () => {
      expect(service.calcTrueShooting(10, 0, 0)).toBe(0);
    });
  });

  // ---------------------------------------------------------------
  // calcEffectiveFG
  // ---------------------------------------------------------------
  describe('calcEffectiveFG', () => {
    it('returns correct eFG%', () => {
      // (8 FG + 0.5*3 3PM) / 15 FGA = (8 + 1.5) / 15 = 0.6333...
      const result = service.calcEffectiveFG(8, 3, 15);
      expect(result).toBeCloseTo(0.6333, 3);
    });

    it('returns 0 when FGA is 0', () => {
      expect(service.calcEffectiveFG(0, 0, 0)).toBe(0);
    });
  });

  // ---------------------------------------------------------------
  // calcFourFactorsOffense
  // ---------------------------------------------------------------
  describe('calcFourFactorsOffense', () => {
    it('computes weighted sum correctly', () => {
      // 0.40*0.5 + 0.25*(1-0.15) + 0.20*0.25 + 0.15*0.30
      // = 0.20 + 0.2125 + 0.05 + 0.045 = 0.5075
      const result = service.calcFourFactorsOffense(0.5, 0.15, 0.25, 0.30);
      expect(result).toBeCloseTo(0.5075, 4);
    });
  });

  // ---------------------------------------------------------------
  // calcFourFactorsDefense
  // ---------------------------------------------------------------
  describe('calcFourFactorsDefense', () => {
    it('computes weighted sum correctly', () => {
      // 0.40*(1-0.45) + 0.25*0.18 + 0.20*0.70 + 0.15*(1-0.25)
      // = 0.22 + 0.045 + 0.14 + 0.1125 = 0.5175
      const result = service.calcFourFactorsDefense(0.45, 0.18, 0.70, 0.25);
      expect(result).toBeCloseTo(0.5175, 4);
    });
  });

  // ---------------------------------------------------------------
  // calcPythagoreanWinPct
  // ---------------------------------------------------------------
  describe('calcPythagoreanWinPct', () => {
    it('returns 0.5 for equal points', () => {
      expect(service.calcPythagoreanWinPct(110, 110)).toBeCloseTo(0.5, 3);
    });

    it('returns > 0.5 when scoring more than allowing', () => {
      expect(service.calcPythagoreanWinPct(115, 105)).toBeGreaterThan(0.5);
    });

    it('returns 0.5 when both are 0', () => {
      expect(service.calcPythagoreanWinPct(0, 0)).toBe(0.5);
    });
  });

  // ---------------------------------------------------------------
  // americanToImplied
  // ---------------------------------------------------------------
  describe('americanToImplied', () => {
    it('converts -110 correctly (~0.5238)', () => {
      expect(service.americanToImplied(-110)).toBeCloseTo(0.5238, 3);
    });

    it('converts +150 correctly (~0.4)', () => {
      expect(service.americanToImplied(150)).toBeCloseTo(0.4, 3);
    });

    it('converts -200 correctly (0.6667)', () => {
      expect(service.americanToImplied(-200)).toBeCloseTo(0.6667, 3);
    });
  });

  // ---------------------------------------------------------------
  // removeVig
  // ---------------------------------------------------------------
  describe('removeVig', () => {
    it('returns probabilities that sum to 1', () => {
      const probs = service.removeVig([-110, -110]);
      const sum = probs.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 5);
    });

    it('normalises a two-outcome market correctly', () => {
      const probs = service.removeVig([-200, +160]);
      expect(probs.length).toBe(2);
      probs.forEach(p => expect(p).toBeGreaterThan(0));
    });
  });

  // ---------------------------------------------------------------
  // calcEV
  // ---------------------------------------------------------------
  describe('calcEV', () => {
    it('returns positive EV when true probability exceeds implied', () => {
      // +100 odds → implied ~0.5; if true prob is 0.6, EV should be positive
      const result = service.calcEV(0.6, 100);
      expect(result.isPositiveEV).toBe(true);
      expect(result.ev).toBeGreaterThan(0);
    });

    it('returns negative EV when true probability is below implied', () => {
      const result = service.calcEV(0.4, -110);
      expect(result.isPositiveEV).toBe(false);
      expect(result.ev).toBeLessThan(0);
    });

    it('includes a kelly fraction', () => {
      const result = service.calcEV(0.6, 100);
      expect(result.kellyFraction).toBeGreaterThanOrEqual(0);
    });
  });
});
