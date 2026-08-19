const express = require('express');
const { Client } = require('pg');

const app = express();

app.get('*', async (_req, res) => {
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

  let dbConnect = false;
  let dbQuery = false;
  let dbErrorClass = 'none';
  if (flags.db) {
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 5000,
      query_timeout: 5000,
    });
    try {
      await client.connect();
      dbConnect = true;
      const result = await client.query('SELECT 1 AS ok');
      dbQuery = result.rows?.[0]?.ok === 1;
    } catch (error) {
      const name = String(error?.code || error?.name || 'error').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24);
      dbErrorClass = name || 'error';
    } finally {
      await client.end().catch(() => undefined);
    }
  }

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
    ['DB_CONNECT', dbConnect],
    ['DB_QUERY', dbQuery],
    ['DB_ERROR_CLASS', dbErrorClass],
  ];
  const encoded = `env-${process.env.VERCEL_ENV || 'missing'}-db${+flags.db}-dbconn${+dbConnect}-dbq${+dbQuery}-dberr-${dbErrorClass}-pg${+flags.postgres}-prisma${+flags.prisma}-neon${+flags.neon}-host${+flags.pghost}-jwt${+flags.jwt}-refresh${+flags.refresh}-front${+flags.frontend}-nba${+flags.nba}`;
  const html = rows
    .map(([key, value]) => `<p><strong>${key}</strong>=${String(value)}</p>`)
    .join('');

  res.set('Cache-Control', 'no-store');
  res.type('html').send(`<!doctype html><html><head><title>${encoded}</title></head><body><main><h1>NEWNBA runtime probe</h1>${html}</main></body></html>`);
});

app.listen(Number(process.env.PORT || 3000));
