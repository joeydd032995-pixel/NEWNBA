import { normalizePlayerName } from './exact-statline-sync.job';

describe('exact StatLine sync helpers', () => {
  it('normalizes player names without changing identity semantics', () => {
    expect(normalizePlayerName('Nikola Jokić')).toBe('nikola jokic');
    expect(normalizePlayerName("De'Andre Hunter")).toBe('de andre hunter');
    expect(normalizePlayerName('  JAYSON   TATUM ')).toBe('jayson tatum');
  });
});
