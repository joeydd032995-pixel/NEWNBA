import { matchRefereeEvent, teamMatchesLabel } from './referee-assignment.job';

const event = (id: string, away: any, home: any) => ({ id, awayTeam: away, homeTeam: home });
const team = (abbreviation: string, city: string, name: string) => ({ abbreviation, city, name });

describe('official referee assignment matching', () => {
  it('matches official city labels to the scheduled NBA event', () => {
    const events = [
      event('g1', team('BOS', 'Boston', 'Celtics'), team('NYK', 'New York', 'Knicks')),
      event('g2', team('MIA', 'Miami', 'Heat'), team('ORL', 'Orlando', 'Magic')),
    ];
    expect(matchRefereeEvent('BOSTON @ NEW YORK', events as any)?.id).toBe('g1');
  });

  it('supports Golden State official labeling even if the DB city differs', () => {
    expect(teamMatchesLabel(team('GSW', 'San Francisco', 'Warriors'), 'GOLDEN STATE')).toBe(true);
  });

  it('does not choose an event when the pair is not unique', () => {
    const duplicate = event('g1', team('BOS', 'Boston', 'Celtics'), team('NYK', 'New York', 'Knicks'));
    expect(matchRefereeEvent('BOSTON @ NEW YORK', [duplicate, { ...duplicate, id: 'g2' }] as any)).toBeNull();
  });

  it('does not broaden unmatched team labels', () => {
    const events = [event('g1', team('BOS', 'Boston', 'Celtics'), team('NYK', 'New York', 'Knicks'))];
    expect(matchRefereeEvent('SEATTLE @ NEW YORK', events as any)).toBeNull();
  });
});
