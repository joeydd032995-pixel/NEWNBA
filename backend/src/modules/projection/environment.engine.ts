export interface GeoPoint {
  latitude: number;
  longitude: number;
  utcOffsetMinutes: number;
  altitudeMeters?: number | null;
}

export interface PriorGameLoad {
  startTime: Date;
  endTime?: Date;
  overtimeMinutes?: number;
  teamMinutesLoad?: number;
}

export interface TeamEnvironmentInput {
  gameStart: Date;
  venue: GeoPoint;
  priorVenue?: GeoPoint | null;
  priorGames: PriorGameLoad[];
}

export interface TeamEnvironmentResult {
  restHours: number | null;
  backToBack: boolean;
  threeInFour: boolean;
  fourInSix: boolean;
  travelDistanceKm: number | null;
  timeZoneChangeHours: number | null;
  altitudeMeters: number | null;
  previousGameOtMinutes: number;
  previousGameMinutesLoad: number;
}

export interface GameEnvironmentResult {
  home: TeamEnvironmentResult;
  away: TeamEnvironmentResult;
  restAdvantageHours: number | null;
}

/** Pure schedule/travel calculator; source data is supplied separately. */
export function calculateGameEnvironment(
  home: TeamEnvironmentInput,
  away: TeamEnvironmentInput,
): GameEnvironmentResult {
  const homeResult = calculateTeamEnvironment(home);
  const awayResult = calculateTeamEnvironment(away);
  return {
    home: homeResult,
    away: awayResult,
    restAdvantageHours:
      homeResult.restHours !== null && awayResult.restHours !== null
        ? homeResult.restHours - awayResult.restHours
        : null,
  };
}

export function calculateTeamEnvironment(input: TeamEnvironmentInput): TeamEnvironmentResult {
  const priorGames = [...input.priorGames]
    .filter((game) => game.startTime.getTime() < input.gameStart.getTime())
    .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
  const prior = priorGames[0] ?? null;
  const priorEnd = prior
    ? prior.endTime ?? new Date(prior.startTime.getTime() + (150 + (prior.overtimeMinutes ?? 0)) * 60_000)
    : null;
  const restHours = priorEnd
    ? Math.max(0, (input.gameStart.getTime() - priorEnd.getTime()) / 3_600_000)
    : null;

  const gamesInWindow = (days: number) => priorGames.filter(
    (game) => input.gameStart.getTime() - game.startTime.getTime() <= days * 86_400_000,
  ).length + 1;

  return {
    restHours,
    backToBack: restHours !== null && restHours < 30,
    threeInFour: gamesInWindow(4) >= 3,
    fourInSix: gamesInWindow(6) >= 4,
    travelDistanceKm: input.priorVenue
      ? haversineKm(input.priorVenue, input.venue)
      : null,
    timeZoneChangeHours: input.priorVenue
      ? (input.venue.utcOffsetMinutes - input.priorVenue.utcOffsetMinutes) / 60
      : null,
    altitudeMeters: input.venue.altitudeMeters ?? null,
    previousGameOtMinutes: prior?.overtimeMinutes ?? 0,
    previousGameMinutesLoad: prior?.teamMinutesLoad ?? 0,
  };
}

export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const radiusKm = 6371.0088;
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const deltaLat = toRadians(b.latitude - a.latitude);
  const deltaLon = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * radiusKm * Math.asin(Math.min(1, Math.sqrt(h)));
}

function toRadians(value: number): number {
  return value * Math.PI / 180;
}
