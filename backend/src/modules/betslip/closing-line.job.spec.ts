import { selectClosingCandidate } from './closing-line.job';

const row = (outcome: string, odds = -110, line: number | null = 25.5) => ({
  outcome,
  odds,
  line,
  updatedAt: new Date('2026-08-18T00:00:00Z'),
});

describe('automatic closing-line selection', () => {
  it('prefers the exact persisted sportsbook outcome', () => {
    const selected = selectClosingCandidate(
      [row('Over', -108), row('Under', -112)],
      { outcome: 'Under', direction: 'UNDER' },
    );
    expect(selected?.outcome).toBe('Under');
    expect(selected?.odds).toBe(-112);
  });

  it('uses canonical over/under direction when the display outcome is descriptive', () => {
    const selected = selectClosingCandidate(
      [row('over', -105), row('under', -115)],
      { outcome: 'Player OVER 25.5 POINTS', direction: 'OVER' },
    );
    expect(selected?.outcome).toBe('over');
  });

  it('does not guess among ambiguous multi-outcome markets', () => {
    const selected = selectClosingCandidate(
      [row('Boston Celtics', -130, null), row('New York Knicks', 110, null)],
      { outcome: 'home', direction: 'HOME' },
    );
    expect(selected).toBeNull();
  });

  it('accepts a single unambiguous sportsbook row', () => {
    expect(selectClosingCandidate([row('Yes', 160, null)], { outcome: 'yes', direction: 'YES' })?.odds).toBe(160);
  });
});
