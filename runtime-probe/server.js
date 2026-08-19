const express = require('express');

const app = express();

app.get('*', (_req, res) => {
  const has = (key) => typeof process.env[key] === 'string' && process.env[key].length > 0;
  const flags = {
    db: has('DATABASE_URL'),
    postgres: has('POSTGRES_URL'),
    prisma: has('POSTGRES_PRISMA_URL'),
    neon: has('NEON_DATABASE_URL'),
    pghost: has('PGHOST'),
    jwt: has('JWT_SECRET'),
    refresh: has('JWT_REFRESH_SECRET'),
    frontend: has('FRONTEND_URL'),
    nba: has('NBA_DATA_URL'),
  };
  const rows = [
    ['VERCEL_ENV', process.env.VERCEL_ENV || 'missing'],
    ['DATABASE_URL', flags.db],
    ['POSTGRES_URL', flags.postgres],
    ['POSTGRES_PRISMA_URL', flags.prisma],
    ['NEON_DATABASE_URL', flags.neon],
    ['PGHOST', flags.pghost],
    ['JWT_SECRET', flags.jwt],
    ['JWT_REFRESH_SECRET', flags.refresh],
    ['FRONTEND_URL', flags.frontend],
    ['NBA_DATA_URL', flags.nba],
  ];
  const encoded = `env-${process.env.VERCEL_ENV || 'missing'}-db${+flags.db}-pg${+flags.postgres}-prisma${+flags.prisma}-neon${+flags.neon}-host${+flags.pghost}-jwt${+flags.jwt}-refresh${+flags.refresh}-front${+flags.frontend}-nba${+flags.nba}`;
  const html = rows
    .map(([key, value]) => `<p><strong>${key}</strong>=${String(value)}</p>`)
    .join('');

  res.set('Cache-Control', 'no-store');
  res.type('html').send(`<!doctype html><html><head><title>${encoded}</title></head><body><main><h1>NEWNBA runtime probe</h1>${html}</main></body></html>`);
});

app.listen(Number(process.env.PORT || 3000));
