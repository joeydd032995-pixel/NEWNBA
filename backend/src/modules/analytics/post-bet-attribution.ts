import { ErrorAttributionType, ProcessGrade } from '@prisma/client';

export interface PostBetAttributionInput {
  expectedMinutes?: number | null;
  minutesFloor?: number | null;
  minutesCeiling?: number | null;
  actualMinutes?: number | null;
  expectedUsage?: number | null;
  actualUsage?: number | null;
  expectedPace?: number | null;
  actualPace?: number | null;
  clvPrice?: number | null;
  clvLine?: number | null;
  foulTrouble?: boolean;
  blowout?: boolean;
  inGameInjury?: boolean;
}

export interface PostBetAttributionResult {
  processGrade: ProcessGrade;
  primaryError: ErrorAttributionType | null;
  minutesProjectionError: number | null;
  usageProjectionError: number | null;
  paceProjectionError: number | null;
  rotationError: boolean;
  marketTimingError: boolean;
  varianceDominated: boolean;
  notes: string[];
}

/**
 * Attribute only what can be observed from stored pregame/actual inputs.
 * Unknown dimensions remain unassigned instead of being labeled "variance" by
 * default. This is deliberately conservative to avoid excusing model errors.
 */
export function attributePostBetProcess(input: PostBetAttributionInput): PostBetAttributionResult {
  const minutesProjectionError = difference(input.actualMinutes, input.expectedMinutes);
  const usageProjectionError = difference(input.actualUsage, input.expectedUsage);
  const paceProjectionError = difference(input.actualPace, input.expectedPace);
  const rotationError = Boolean(
    input.actualMinutes !== null &&
      input.actualMinutes !== undefined &&
      ((input.minutesFloor !== null && input.minutesFloor !== undefined && input.actualMinutes < input.minutesFloor - 1) ||
        (input.minutesCeiling !== null && input.minutesCeiling !== undefined && input.actualMinutes > input.minutesCeiling + 1)),
  );
  const marketTimingError = (input.clvPrice ?? 0) < -0.02 || (input.clvLine ?? 0) < -0.5;

  let primaryError: ErrorAttributionType | null = null;
  if (input.inGameInjury) primaryError = ErrorAttributionType.IN_GAME_INJURY;
  else if (input.foulTrouble) primaryError = ErrorAttributionType.FOUL_TROUBLE;
  else if (input.blowout) primaryError = ErrorAttributionType.BLOWOUT;
  else if (minutesProjectionError !== null && Math.abs(minutesProjectionError) >= 4) {
    primaryError = ErrorAttributionType.MINUTES_PROJECTION;
  } else if (usageProjectionError !== null && Math.abs(usageProjectionError) >= 0.04) {
    primaryError = ErrorAttributionType.USAGE_PROJECTION;
  } else if (paceProjectionError !== null && Math.abs(paceProjectionError) >= 4) {
    primaryError = ErrorAttributionType.PACE;
  } else if (marketTimingError) {
    primaryError = ErrorAttributionType.MARKET_TIMING;
  }

  const notes: string[] = [];
  if (minutesProjectionError === null) notes.push('Minutes attribution unavailable: expected or actual minutes missing.');
  if (usageProjectionError === null) notes.push('Usage attribution unavailable: pregame or actual usage missing.');
  if (paceProjectionError === null) notes.push('Pace attribution unavailable: pregame or actual pace missing.');
  if (input.clvPrice === null || input.clvPrice === undefined) notes.push('Price CLV unavailable.');

  const observedErrors = [
    minutesProjectionError !== null && Math.abs(minutesProjectionError) >= 4,
    usageProjectionError !== null && Math.abs(usageProjectionError) >= 0.04,
    paceProjectionError !== null && Math.abs(paceProjectionError) >= 4,
    marketTimingError,
    Boolean(input.foulTrouble),
    Boolean(input.blowout),
    Boolean(input.inGameInjury),
  ].filter(Boolean).length;

  let processGrade: ProcessGrade = ProcessGrade.MIXED;
  if (observedErrors === 0 && (input.clvPrice ?? 0) >= 0) processGrade = ProcessGrade.CORRECT;
  else if (observedErrors <= 1 && !marketTimingError) processGrade = ProcessGrade.MOSTLY_CORRECT;
  else if (observedErrors >= 3) processGrade = ProcessGrade.INCORRECT;
  else if (observedErrors === 2) processGrade = ProcessGrade.MOSTLY_INCORRECT;

  // Variance is only asserted when stored process inputs broadly matched and no
  // concrete structural/market error was observed. Outcome alone never triggers it.
  const varianceDominated = observedErrors === 0 && (
    input.expectedMinutes !== null ||
    input.expectedUsage !== null ||
    input.expectedPace !== null
  );

  return {
    processGrade,
    primaryError,
    minutesProjectionError,
    usageProjectionError,
    paceProjectionError,
    rotationError,
    marketTimingError,
    varianceDominated,
    notes,
  };
}

function difference(actual?: number | null, expected?: number | null): number | null {
  if (actual === null || actual === undefined || expected === null || expected === undefined) return null;
  return actual - expected;
}
