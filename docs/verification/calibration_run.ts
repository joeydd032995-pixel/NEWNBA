import * as fs from 'fs';
const eng = require(require('path').resolve(process.cwd(), 'src/modules/projection/opportunity-projection.engine'));
const { jobs, truth } = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const out = jobs.map((j: any) => {
  const d = eng.projectDistribution(j.input);
  const lines = truth[j.key].lines;
  return { key: j.key, mean: d.mean, sd: d.stdDev, pOver: lines.map((l: number) => eng.probabilityOver(d, l)) };
});
fs.writeFileSync(process.argv[3], JSON.stringify(out));
console.log('ran', out.length);
