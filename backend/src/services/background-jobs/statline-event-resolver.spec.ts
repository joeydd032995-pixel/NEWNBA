import { parseNbaMatchup, resolveStatLogEvent } from './statline-event-resolver';

const event = (
  id: string,
  startTime: string,
  away: string,
  home: string,
) => ({
  id,
  startTime: new Date(startTime),
  awayTeam: { abbreviation: away },
  homeTeam: { abbreviation: home },
});

describe('exact StatLine event resolution', () => {
  it('parses nba_api away and home matchup forms', () => {
    expect(parseNbaMatchup('LAL @ BOS')).toEqual({ team: 'LAL', opponent: 'BOS', isHome: false });
    expect(parseNbaMatchup('LAL vs. BOS')).toEqual({ team: 'LAL', opponent: 'BOS', isHome: true });
  });

  it('resolves the unique event by date and team orientation', () => {
    const events = [
      event('correct', '2026-02-10T00:30:00Z', 'LAL', 'BOS'),
      event('wrong-pair', '2026-02-10T01:00:00Z', 'NYK', 'BOS'),
      event('wrong-date', '2026-02-13T00:30:00Z', 'LAL', 'BOS'),
    ];
    const resolved = resolveStatLogEvent(
      { gameDate: new Date('2026-02-10T00:00:00Z'), matchup: 'LAL @ BOS' },
      events,
    );
    expect(resolved?.id).toBe('correct');
  });

  it('does not resolve when home/away orientation is wrong', () => {
    const events = [event('reversed', '2026-02-10T00:30:00Z', 'BOS', 'LAL')];
    expect(resolveStatLogEvent(
      { gameDate: new Date('2026-02-10T00:00:00Z'), matchup: 'LAL @ BOS' },
      events,
    )).toBeNull();
  });

  it('fails closed on duplicate candidate events', () => {
    const events = [
      event('a', '2026-02-10T00:30:00Z', 'LAL', 'BOS'),
      event('b', '2026-02-10T01:00:00Z', 'LAL', 'BOS'),
    ];
    expect(resolveStatLogEvent(
      { gameDate: new Date('2026-02-10T00:00:00Z'), matchup: 'LAL @ BOS' },
      events,
    )).toBeNull();
  });

  it('fails closed on unknown matchup syntax', () => {
    expect(resolveStatLogEvent(
      { gameDate: new Date('2026-02-10T00:00:00Z'), matchup: 'LAL-BOS' },
      [],
    )).toBeNull();
  });
});
