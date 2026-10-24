const eng = require(require('path').resolve(process.cwd(), 'src/modules/projection/opportunity-projection.engine'));
const corr = require(require('path').resolve(process.cwd(), 'src/modules/projection/correlation.engine'));
const mil = require(require('path').resolve(process.cwd(), 'src/modules/projection/milestone.engine'));
const f: any = { stat:'POINTS', analysisMode:'STANDARD', seed:1, minutes:{floor:24,median:34,ceiling:40,stdDev:3}, opportunityRatePerMinute:.62, conversionRate:1.18, contextAdjustment:1,
  uncertainty:{minutesStdDev:2.5,opportunityRateStdDev:.05,conversionRateStdDev:.08,contextStdDev:.04,paceStdDev:.02}, scripts:[{script:'COMPETITIVE',probability:1,minutesMultiplier:1,opportunityMultiplier:1}], dataQuality:'HIGH' };
const t = (n: string, fn: () => any, reps = 5) => { fn(); const s = process.hrtime.bigint(); for (let i = 0; i < reps; i++) fn(); const ms = Number(process.hrtime.bigint() - s) / 1e6 / reps; console.log(n.padEnd(46), ms.toFixed(1).padStart(8), 'ms'); };
for (const m of ['FAST','STANDARD','DEEP']) t(`projectDistribution ${m}`, () => eng.projectDistribution({ ...f, analysisMode: m }));
const d = eng.projectDistribution(f);
t('probabilityOver on 10k samples (x1000 calls)', () => { for (let i = 0; i < 1000; i++) eng.probabilityOver(d, 20 + i / 100); });
const ds = [1,2,3].map(s => eng.projectDistribution({ ...f, seed: s }));
const R = [[1,.2,.3],[.2,1,-.1],[.3,-.1,1]];
t('combineCorrelatedDistributions (3 comps, 10k)', () => corr.combineCorrelatedDistributions(ds, R, 5, 10000, 'PRA'));
t('correlatedJointProbability (3 legs, 25k)', () => corr.correlatedJointProbability(ds, [20,6,4], ['OVER','OVER','OVER'], R, 5, 25000));
t('milestone DD (3 comps, 25k)', () => mil.simulateMilestoneDistribution({ components: ds, correlationMatrix: R, requiredCategories: 2, seed: 5, stat: 'DOUBLE_DOUBLE' }));
// full-slate estimate: 12 games x ~10 players x 7 stats
const t0 = Date.now(); for (let i = 0; i < 120 * 7; i++) eng.projectDistribution({ ...f, seed: i, analysisMode: 'STANDARD' }); console.log('full-slate sweep 840 STANDARD projections:', Date.now() - t0, 'ms');
