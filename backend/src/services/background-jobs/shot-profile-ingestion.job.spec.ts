import { normalizeName } from './shot-profile-ingestion.job';

describe('shot-profile player matching', () => {
  it('normalizes punctuation and diacritics for NBA name matching', () => {
    expect(normalizeName('Nikola Jokić')).toBe('nikola jokic');
    expect(normalizeName("De'Andre Hunter")).toBe('de andre hunter');
  });

  it('normalizes repeated whitespace and case', () => {
    expect(normalizeName('  JAYSON   TATUM  ')).toBe('jayson tatum');
  });
});
