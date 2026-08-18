export interface RefereeGameSample {
  minutes: number;
  fouls: number;
  freeThrowAttempts: number;
  possessions: number;
  interruptions?: number;
}

export interface LeagueRefereeBaseline {
  foulsPer48: number;
  freeThrowsPer48: number;
  possessionsPer48: number;
  interruptionsPer48?: number;
}

export interface RefereeImpactResult {
  games: number;
  sampleMinutes: number;
  foulsPer48: number;
  freeThrowsPer48: number;
  pacePer48: number;
  interruptionsPer48: number;
  freeThrowRateImpact: number;
  paceImpact: number;
  sampleReliability: number;
}

/** Aggregate confirmed-assignment samples; never infer causality from crew name alone. */
export function calculateRefereeImpact(
  samples: RefereeGameSample[],
  baseline: LeagueRefereeBaseline,
): RefereeImpactResult {
  const valid = samples.filter((sample) => sample.minutes > 0);
  const minutes = valid.reduce((sum, sample) => sum + sample.minutes, 0);
  const scale = minutes > 0 ? 48 / minutes : 0;
  const foulsPer48 = valid.reduce((sum, sample) => sum + sample.fouls, 0) * scale;
  const freeThrowsPer48 = valid.reduce((sum, sample) => sum + sample.freeThrowAttempts, 0) * scale;
  const pacePer48 = valid.reduce((sum, sample) => sum + sample.possessions, 0) * scale;
  const interruptionsPer48 = valid.reduce((sum, sample) => sum + (sample.interruptions ?? 0), 0) * scale;

  // Reliability intentionally rises slowly; referee trends should remain supplementary.
  const sampleReliability = Math.min(1, Math.sqrt(valid.length / 50));
  return {
    games: valid.length,
    sampleMinutes: minutes,
    foulsPer48,
    freeThrowsPer48,
    pacePer48,
    interruptionsPer48,
    freeThrowRateImpact: baseline.freeThrowsPer48 > 0
      ? ((freeThrowsPer48 / baseline.freeThrowsPer48) - 1) * sampleReliability
      : 0,
    paceImpact: baseline.possessionsPer48 > 0
      ? ((pacePer48 / baseline.possessionsPer48) - 1) * sampleReliability
      : 0,
    sampleReliability,
  };
}
