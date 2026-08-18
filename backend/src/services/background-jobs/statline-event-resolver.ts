export interface StatLogIdentity {
  gameDate: Date;
  matchup: string;
}

export interface CandidateEvent {
  id: string;
  startTime: Date;
  homeTeam: { abbreviation: string };
  awayTeam: { abbreviation: string };
}

export interface ParsedMatchup {
  team: string;
  opponent: string;
  isHome: boolean;
}

/**
 * Parse nba_api matchup strings such as `LAL @ BOS` and `LAL vs. BOS`.
 * Returns null for unfamiliar syntax rather than guessing the team orientation.
 */
export function parseNbaMatchup(value: string): ParsedMatchup | null {
  const normalized = String(value ?? '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
  const away = normalized.match(/^([A-Z0-9]{2,4})\s+@\s+([A-Z0-9]{2,4})$/);
  if (away) return { team: away[1], opponent: away[2], isHome: false };

  const home = normalized.match(/^([A-Z0-9]{2,4})\s+VS\.?\s+([A-Z0-9]{2,4})$/);
  if (home) return { team: home[1], opponent: home[2], isHome: true };
  return null;
}

/**
 * Resolve a historical player game log to the actual NEWNBA event.
 *
 * Date matching allows a 20-hour window because NBA event timestamps are UTC
 * while game-log dates are typically local calendar dates. Team orientation is
 * mandatory and the result must be unique. Ambiguous/missing events return null.
 */
export function resolveStatLogEvent(
  log: StatLogIdentity,
  events: CandidateEvent[],
): CandidateEvent | null {
  const matchup = parseNbaMatchup(log.matchup);
  if (!matchup) return null;
  const target = log.gameDate.getTime();
  if (!Number.isFinite(target)) return null;

  const matches = events.filter((event) => {
    const timeDistanceHours = Math.abs(event.startTime.getTime() - target) / 3_600_000;
    if (timeDistanceHours > 20) return false;
    const home = event.homeTeam.abbreviation.toUpperCase();
    const away = event.awayTeam.abbreviation.toUpperCase();
    return matchup.isHome
      ? home === matchup.team && away === matchup.opponent
      : away === matchup.team && home === matchup.opponent;
  });

  return matches.length === 1 ? matches[0] : null;
}
