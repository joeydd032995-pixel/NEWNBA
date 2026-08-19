const express = require('express');

const app = express();

app.get('*', (_req, res) => {
  const has = (key) => typeof process.env[key] === 'string' && process.env[key].length > 0;
  res.set('Cache-Control', 'no-store');
  res.json({
    ok: true,
    environment: process.env.VERCEL_ENV || null,
    keys: {
      DATABASE_URL: has('DATABASE_URL'),
      POSTGRES_URL: has('POSTGRES_URL'),
      POSTGRES_PRISMA_URL: has('POSTGRES_PRISMA_URL'),
      NEON_DATABASE_URL: has('NEON_DATABASE_URL'),
      PGHOST: has('PGHOST'),
      JWT_SECRET: has('JWT_SECRET'),
      JWT_REFRESH_SECRET: has('JWT_REFRESH_SECRET'),
      FRONTEND_URL: has('FRONTEND_URL'),
      NBA_DATA_URL: has('NBA_DATA_URL'),
    },
  });
});

app.listen(Number(process.env.PORT || 3000));
