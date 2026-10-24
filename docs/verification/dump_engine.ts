/* Dumps real-engine outputs on fixed fixtures to JSON for cross-verification. */
import * as fs from 'fs';
const SRC = require('path').resolve(process.cwd(), 'src/modules'); // run from backend/
// eslint-disable-next-line @typescript-eslint/no-var-requires
const math = require(`${SRC}/projection/projection.math`);
const eng = require(`${SRC}/projection/opportunity-projection.engine`);
const dec = require(`${SRC}/projection/decision.engine`);
const corr = require(`${SRC}/projection/correlation.engine`);
const AnalyticsService = require(`${SRC}/analytics/analytics.service`).AnalyticsService;

const base = {
  stat: 'POINTS',
  analysisMode: 'STANDARD',
  seed: 20262027,
  minutes: { floor: 24, median: 34, ceiling: 40, stdDev: 3 },
  opportunityRatePerMinute: 0.62,
  conversionRate: 1.18,
  contextAdjustment: 1.02,
  baselinePace: 99,
  expectedPace: 101,
  uncertainty: { minutesStdDev: 2.5, opportunityRateStdDev: 0.05, conversionRateStdDev: 0.08, contextStdDev: 0.04, paceStdDev: 0.02 },
  scripts: [{ script: 'COMPETITIVE', probability: 1, minutesMultiplier: 1, opportunityMultiplier: 1 }],
  dataQuality: 'HIGH',
};
const fixtures: Record<string, any> = {
  F1_simple_points: { ...base },
  F2_foul_blowout_scripts: {
    ...base,
    foulTroubleProbability: 0.12, foulMinutesPenalty: 6,
    blowoutProbability: 0.18, blowoutMinutesPenalty: 5,
    scripts: [
      { script: 'COMPETITIVE', probability: 0.55, minutesMultiplier: 1, opportunityMultiplier: 1 },
      { script: 'FAVORITE_CONTROL', probability: 0.3, minutesMultiplier: 0.9, opportunityMultiplier: 0.97, conversionMultiplier: 1.02 },
      { script: 'DISRUPTION', probability: 0.15, minutesMultiplier: 0.8, opportunityMultiplier: 1.05, contextMultiplier: 0.97 },
    ],
  },
  F3_rebounds_ppp: {
    ...base, stat: 'REBOUNDS',
    minutes: { floor: 20, median: 31, ceiling: 38 },
    opportunityRatePerMinute: 0.31, conversionRate: 0.92, contextAdjustment: 1.0,
    baselinePpp: 1.12, expectedPpp: 1.18,
    uncertainty: { minutesStdDev: 2.0, opportunityRateStdDev: 0.04, conversionRateStdDev: 0.05, contextStdDev: 0.03, paceStdDev: 0.02 },
  },
  F4_possession_share: {
    ...base, stat: 'ASSISTS',
    minutes: { floor: 26, median: 35, ceiling: 40, stdDev: 2.5 },
    expectedPossessions: 100, playerOpportunityShare: 0.19,
    opportunityRatePerMinute: 0.5, conversionRate: 0.43, contextAdjustment: 1.0,
    uncertainty: { minutesStdDev: 2.0, opportunityRateStdDev: 0.03, conversionRateStdDev: 0.04, contextStdDev: 0.03, paceStdDev: 0.02 },
  },
};

const out: any = { fixtures: {}, repro: {}, odds: {}, playable: [], corr: {}, decision: [] };

for (const [name, f] of Object.entries(fixtures)) {
  const lines = [f.stat === 'POINTS' ? 18.5 : 6.5, f.stat === 'POINTS' ? 22.5 : 8.5, f.stat === 'POINTS' ? 26.5 : 10.5, f.stat === 'POINTS' ? 30.5 : 12.5];
  const modes: any = {};
  for (const mode of ['FAST', 'STANDARD', 'DEEP']) {
    const d = eng.projectDistribution({ ...f, analysisMode: mode });
    modes[mode] = {
      trials: d.trials, mean: d.mean, median: d.median, sd: d.stdDev, pct: d.percentiles,
      pointEstimate: d.pointEstimate, equation: d.opportunityEquation,
      pOver: lines.map((l: number) => eng.probabilityOver(d, l)),
      pUnder: lines.map((l: number) => eng.probabilityUnder(d, l)),
    };
  }
  out.fixtures[name] = { input: f, lines, modes };
}

// Seed reproducibility
const a = eng.projectDistribution(fixtures.F1_simple_points);
const b = eng.projectDistribution(fixtures.F1_simple_points);
const c = eng.projectDistribution({ ...fixtures.F1_simple_points, seed: 7 });
out.repro = {
  identical: JSON.stringify(a.samples) === JSON.stringify(b.samples),
  differentSeedDiffers: JSON.stringify(a.samples) !== JSON.stringify(c.samples),
  meanSeedA: a.mean, meanSeed7: c.mean,
};

// Odds math: grid
const svc = Object.create(AnalyticsService.prototype);
const oddsGrid = [-1000, -500, -250, -150, -125, -110, -105, -101, 100, 101, 105, 110, 125, 150, 200, 300, 500, 1000];
out.odds.grid = oddsGrid.map((o) => ({
  odds: o,
  decimal: math.americanToDecimal(o),
  impliedMath: math.americanToImplied(o),
  impliedAnalytics: svc.americanToImplied(o),
  ev_p55: math.expectedValue(0.55, o),
  evAnalytics_p55: svc.calcEV(0.55, o, 100).ev / 100,
  kellyAnalytics_p55: svc.calcEV(0.55, o, 100).kellyFraction,
}));
const pairs: Array<[number, number]> = [[-110, -110], [-115, -105], [-130, 110], [-200, 170], [105, -125], [-105, -105], [150, -180]];
out.odds.noVig = pairs.map(([o, u]) => ({
  over: o, under: u, math: math.noVigTwoWay(o, u), analytics: svc.removeVig([o, u]),
}));

// maxPlayableAmericanPrice sweep
for (let p = 0.2; p <= 0.9001; p += 0.0173) {
  for (const minEv of [0, 0.03]) {
    const price = dec.maxPlayableAmericanPrice(p, minEv);
    out.playable.push({ p, minEv, price, evAtPrice: math.expectedValue(p, price) });
  }
}

// Correlation: pearson vs given series
const s1 = [22, 31, 18, 27, 35, 24, 29, 20, 33, 26];
const s2 = [7, 10, 5, 8, 12, 6, 9, 5, 11, 8];
const s3 = [4, 3, 7, 5, 2, 6, 4, 8, 3, 5];
out.corr.series = [s1, s2, s3];
out.corr.matrix = corr.empiricalCorrelationMatrix([s1, s2, s3]);

// PRA composite from independent components + empirical corr vs naive sum
const pts = eng.projectDistribution({ ...fixtures.F1_simple_points, seed: 1 });
const reb = eng.projectDistribution({ ...fixtures.F3_rebounds_ppp, seed: 2 });
const ast = eng.projectDistribution({ ...fixtures.F4_possession_share, seed: 3 });
const R = [[1, 0.2, 0.3], [0.2, 1, -0.1], [0.3, -0.1, 1]];
const comp = corr.combineCorrelatedDistributions([pts, reb, ast], R, 99, 40000, 'PRA');
out.corr.pra = { mean: comp.mean, sd: comp.stdDev, p05: comp.percentiles.p05, p95: comp.percentiles.p95,
  compMeans: [pts.mean, reb.mean, ast.mean], compSds: [pts.stdDev, reb.stdDev, ast.stdDev], R };

// Decision engine sweep
for (const quality of ['LOW', 'MEDIUM', 'HIGH']) {
  for (const line of [20.5, 22.5, 24.5, 26.5]) {
    const d = eng.projectDistribution({ ...fixtures.F1_simple_points, dataQuality: quality });
    const r = dec.evaluateDecision({ distribution: d, market: { line, overOdds: -110, underOdds: -110, sportsbook: 'fixture' }, dataQuality: quality });
    out.decision.push({ quality, line, decision: r.decision, side: r.side, p: r.probability, ev: r.estimatedEv, noVig: r.noVigProbability, fair: r.fairLine, playableTo: r.playableToLine, playableOdds: r.playableToOdds, conf: r.confidence });
  }
}
for (const flag of ['unresolvedAvailability', 'unresolvedLineup', 'unresolvedMinutesRestriction']) {
  const d = eng.projectDistribution(fixtures.F1_simple_points);
  const r = dec.evaluateDecision({ distribution: d, market: { line: 22.5, overOdds: -110, underOdds: -110 }, dataQuality: 'HIGH', [flag]: true });
  out.decision.push({ flag, decision: r.decision, newsDecision: r.newsDecision, ev: r.estimatedEv });
}

fs.writeFileSync(process.argv[2], JSON.stringify(out));
console.log('wrote', process.argv[2]);
