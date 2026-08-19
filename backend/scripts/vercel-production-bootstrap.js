const { spawnSync } = require('node:child_process');

if (process.env.VERCEL_ENV !== 'production') {
  process.exit(0);
}

if (!process.env.DATABASE_URL) {
  console.error('Production database bootstrap requires DATABASE_URL.');
  process.exit(1);
}

function run(args, { allowAlreadyApplied = false } = {}) {
  const result = spawnSync('npx', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    env: process.env,
  });

  if (result.status === 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    return;
  }

  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  if (allowAlreadyApplied && /already recorded as applied/i.test(output)) {
    console.log(`Prisma migration already recorded: ${args[args.length - 1]}`);
    return;
  }

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.status || 1);
}

console.log('Bootstrapping fresh NEWNBA production database from current Prisma schema...');
run(['prisma', 'db', 'push']);

const migrations = [
  '20260818000000_baseline_main',
  '20260818033000_opportunity_first_phase1',
  '20260818033100_remove_simulated_public_betting',
  '20260818040000_wager_projection_snapshots',
  '20260818050000_expand_nba_markets',
  '20260818103000_priority_hardening_2',
];

for (const migration of migrations) {
  run(['prisma', 'migrate', 'resolve', '--applied', migration], { allowAlreadyApplied: true });
}

console.log('NEWNBA production database bootstrap completed.');
