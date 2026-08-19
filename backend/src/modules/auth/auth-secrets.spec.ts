import { resolveAuthSecrets } from './auth-secrets';

function config(values: Record<string, string | undefined>) {
  return {
    get: jest.fn((key: string) => values[key]),
  } as any;
}

describe('resolveAuthSecrets', () => {
  it('prefers explicit JWT secrets', () => {
    const resolved = resolveAuthSecrets(
      config({
        JWT_SECRET: 'explicit-access',
        JWT_REFRESH_SECRET: 'explicit-refresh',
        DATABASE_URL: 'postgresql://ignored',
      }),
    );

    expect(resolved.jwtSecret).toBe('explicit-access');
    expect(resolved.refreshSecret).toBe('explicit-refresh');
    expect(resolved.usingDerivedJwtSecret).toBe(false);
    expect(resolved.usingDerivedRefreshSecret).toBe(false);
  });

  it('derives stable and distinct fallback secrets from DATABASE_URL', () => {
    const cfg = config({ DATABASE_URL: 'postgresql://user:secret@db.example/neondb' });

    const first = resolveAuthSecrets(cfg);
    const second = resolveAuthSecrets(cfg);

    expect(first.jwtSecret).toHaveLength(128);
    expect(first.refreshSecret).toHaveLength(128);
    expect(first.jwtSecret).not.toBe(first.refreshSecret);
    expect(first.jwtSecret).toBe(second.jwtSecret);
    expect(first.refreshSecret).toBe(second.refreshSecret);
    expect(first.usingDerivedJwtSecret).toBe(true);
    expect(first.usingDerivedRefreshSecret).toBe(true);
  });

  it('derives only the missing secret when one explicit key exists', () => {
    const resolved = resolveAuthSecrets(
      config({
        JWT_SECRET: 'explicit-access',
        DATABASE_URL: 'postgresql://user:secret@db.example/neondb',
      }),
    );

    expect(resolved.jwtSecret).toBe('explicit-access');
    expect(resolved.refreshSecret).toHaveLength(128);
    expect(resolved.usingDerivedJwtSecret).toBe(false);
    expect(resolved.usingDerivedRefreshSecret).toBe(true);
  });

  it('fails closed when neither explicit secrets nor DATABASE_URL are available', () => {
    expect(() => resolveAuthSecrets(config({}))).toThrow('Authentication secrets are unavailable');
  });
});
