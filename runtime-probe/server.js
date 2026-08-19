const express = require('express');

const app = express();

app.get('*', (_req, res) => {
  const has = (key) => typeof process.env[key] === 'string' && process.env[key].length > 0;
  const rows = [
    ['VERCEL_ENV', process.env.VERCEL_ENV || 'missing'],
    ['DATABASE_URL', has('DATABASE_URL')],
    ['POSTGRES_URL', has('POSTGRES_URL')],
    ['POSTGRES_PRISMA_URL', has('POSTGRES_PRISMA_URL')],
    ['NEON_DATABASE_URL', has('NEON_DATABASE_URL')],
    ['PGHOST', has('PGHOST')],
    ['JWT_SECRET', has('JWT_SECRET')],
    ['JWT_REFRESH_SECRET', has('JWT_REFRESH_SECRET')],
    ['FRONTEND_URL', has('FRONTEND_URL')],
    ['NBA_DATA_URL', has('NBA_DATA_URL')],
  ];

  const html = rows
    .map(([key, value]) => `<p><strong>${key}</strong>=${String(value)}</p>`)
    .join('');

  res.set('Cache-Control', 'no-store');
  res.type('html').send(`<!doctype html><html><head><title>NEWNBA runtime probe</title></head><body><main><h1>NEWNBA runtime probe</h1>${html}</main></body></html>`);
});

app.listen(Number(process.env.PORT || 3000));
