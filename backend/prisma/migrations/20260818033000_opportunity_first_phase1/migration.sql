-- Opportunity-First Phase 1 typed persistence layer
-- Additive migration: existing API-facing tables remain intact.

CREATE TYPE "BetDirection" AS ENUM ('OVER', 'UNDER', 'HOME', 'AWAY', 'YES', 'NO', 'OTHER');
CREATE TYPE "ConfidenceBucket" AS ENUM ('LOW', 'MODERATE', 'HIGH');
CREATE TYPE "DecisionClass" AS ENUM ('PASS', 'WAIT', 'LEAN', 'BET', 'STRONG_BET');
CREATE TYPE "SeasonPhase" AS ENUM ('PRESEASON', 'REGULAR_SEASON', 'PLAY_IN', 'PLAYOFFS', 'FINALS');
CREATE TYPE "AnalysisMode" AS ENUM ('FAST', 'STANDARD', 'DEEP');
CREATE TYPE "DataQualityLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
CREATE TYPE "SourceTier" AS ENUM ('TIER_1_OFFICIAL', 'TIER_2_HIGH_QUALITY', 'TIER_3_REPORTING', 'LOW_PRIORITY', 'SIMULATED');
CREATE TYPE "RefereeRole" AS ENUM ('CREW_CHIEF', 'REFEREE', 'UMPIRE', 'CREW', 'ALTERNATE');
CREATE TYPE "LineupType" AS ENUM ('EXPECTED_STARTERS', 'OFFICIAL_STARTERS', 'OPENING', 'CLOSING', 'SMALL_BALL', 'DOUBLE_BIG', 'BENCH_HEAVY');
CREATE TYPE "LineupStatus" AS ENUM ('PROJECTED', 'CONFIRMED', 'SUPERSEDED');
CREATE TYPE "PlayerRotationRole" AS ENUM ('PRIMARY_CREATOR', 'SECONDARY_CREATOR', 'SCORING_SPECIALIST', 'CONNECTOR', 'RIM_BIG', 'STRETCH_BIG', 'DEFENSIVE_SPECIALIST', 'BENCH_SCORER', 'ROTATION_PLAYER', 'END_OF_BENCH');
CREATE TYPE "StarterStatus" AS ENUM ('CONFIRMED_STARTER', 'EXPECTED_STARTER', 'BENCH', 'UNKNOWN');
CREATE TYPE "AvailabilityConstraint" AS ENUM ('NONE', 'POSSIBLE', 'CONFIRMED');
CREATE TYPE "PlayType" AS ENUM ('PICK_AND_ROLL_BALL_HANDLER', 'PICK_AND_ROLL_ROLL_MAN', 'ISOLATION', 'POST_UP', 'HANDOFF', 'TRANSITION', 'HALF_COURT', 'SPOT_UP', 'CUT', 'OFF_SCREEN', 'PUTBACK');
CREATE TYPE "ProcessGrade" AS ENUM ('CORRECT', 'MOSTLY_CORRECT', 'MIXED', 'MOSTLY_INCORRECT', 'INCORRECT');
CREATE TYPE "ErrorAttributionType" AS ENUM ('MINUTES_PROJECTION', 'USAGE_PROJECTION', 'INJURY_INFORMATION', 'ROTATION', 'MATCHUP', 'PACE', 'EFFICIENCY', 'MARKET_TIMING', 'PRICE', 'VARIANCE', 'FOUL_TROUBLE', 'BLOWOUT', 'IN_GAME_INJURY', 'UNEXPECTED_COACHING');
CREATE TYPE "PerformanceDimension" AS ENUM ('CONFIDENCE', 'PROP_TYPE', 'DIRECTION', 'SEASON_PHASE', 'MARKET_TYPE', 'SPORTSBOOK');

ALTER TABLE "model_performance"
  ADD COLUMN "clvRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "avgClv" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "avgOdds" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "bet_slip_items"
  ADD COLUMN "bookId" TEXT,
  ADD COLUMN "recommendedLine" DOUBLE PRECISION,
  ADD COLUMN "closingLine" DOUBLE PRECISION,
  ADD COLUMN "closingOdds" DOUBLE PRECISION,
  ADD COLUMN "clvLine" DOUBLE PRECISION,
  ADD COLUMN "clvPrice" DOUBLE PRECISION,
  ADD COLUMN "direction" "BetDirection",
  ADD COLUMN "confidenceBucket" "ConfidenceBucket",
  ADD COLUMN "decisionClass" "DecisionClass",
  ADD COLUMN "propStatType" "PropStatType",
  ADD COLUMN "seasonPhase" "SeasonPhase",
  ADD COLUMN "recommendedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "closedAt" TIMESTAMP(3);

CREATE TABLE "referees" (
  "id" TEXT NOT NULL,
  "nbaId" INTEGER,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "referees_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "referee_assignments" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "refereeId" TEXT NOT NULL,
  "role" "RefereeRole" NOT NULL DEFAULT 'CREW',
  "source" TEXT NOT NULL,
  "sourceTier" "SourceTier" NOT NULL,
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "referee_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "referee_metrics" (
  "id" TEXT NOT NULL,
  "refereeId" TEXT NOT NULL,
  "season" TEXT NOT NULL,
  "games" INTEGER NOT NULL DEFAULT 0,
  "foulsPer48" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "freeThrowsPer48" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "freeThrowRateImpact" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "paceImpact" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "interruptionsPer48" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "sampleSize" INTEGER NOT NULL DEFAULT 0,
  "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "referee_metrics_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "game_environment" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "arenaName" TEXT,
  "arenaCity" TEXT,
  "arenaAltitudeMeters" DOUBLE PRECISION,
  "homeTimeZone" TEXT,
  "awayOriginTimeZone" TEXT,
  "travelDistanceKm" DOUBLE PRECISION,
  "timeZoneChangeHours" DOUBLE PRECISION,
  "homeRestDays" DOUBLE PRECISION,
  "awayRestDays" DOUBLE PRECISION,
  "homeBackToBack" BOOLEAN NOT NULL DEFAULT false,
  "awayBackToBack" BOOLEAN NOT NULL DEFAULT false,
  "homeThreeInFour" BOOLEAN NOT NULL DEFAULT false,
  "awayThreeInFour" BOOLEAN NOT NULL DEFAULT false,
  "homeFourInSix" BOOLEAN NOT NULL DEFAULT false,
  "awayFourInSix" BOOLEAN NOT NULL DEFAULT false,
  "homePreviousOtMinutes" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "awayPreviousOtMinutes" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "homePreviousGameMinutesLoad" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "awayPreviousGameMinutesLoad" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "restAdvantageHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "source" TEXT,
  "sourceTier" "SourceTier",
  "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "game_environment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "game_lineups" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "lineupType" "LineupType" NOT NULL,
  "status" "LineupStatus" NOT NULL,
  "source" TEXT,
  "sourceTier" "SourceTier",
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "game_lineups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "game_lineup_players" (
  "id" TEXT NOT NULL,
  "lineupId" TEXT NOT NULL,
  "playerId" TEXT NOT NULL,
  "slot" INTEGER,
  "isStarter" BOOLEAN NOT NULL DEFAULT false,
  "isExpected" BOOLEAN NOT NULL DEFAULT true,
  "minutesShare" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "game_lineup_players_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rotation_projections" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "playerId" TEXT NOT NULL,
  "role" "PlayerRotationRole" NOT NULL,
  "starterStatus" "StarterStatus" NOT NULL,
  "rotationOrder" INTEGER,
  "minutesFloor" DOUBLE PRECISION NOT NULL,
  "minutesMedian" DOUBLE PRECISION NOT NULL,
  "minutesCeiling" DOUBLE PRECISION NOT NULL,
  "minutesStdDev" DOUBLE PRECISION NOT NULL,
  "uncertaintyScore" DOUBLE PRECISION NOT NULL,
  "closingProbability" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "restrictionMinutes" DOUBLE PRECISION,
  "loadManagementStatus" "AvailabilityConstraint" NOT NULL DEFAULT 'NONE',
  "suspensionStatus" "AvailabilityConstraint" NOT NULL DEFAULT 'NONE',
  "source" TEXT,
  "sourceTier" "SourceTier",
  "projectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "rotation_projections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "coach_rotation_tendencies" (
  "id" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "season" TEXT NOT NULL,
  "coachName" TEXT NOT NULL,
  "averageRotationSize" DOUBLE PRECISION NOT NULL,
  "starterStaggerRate" DOUBLE PRECISION NOT NULL,
  "smallBallRate" DOUBLE PRECISION NOT NULL,
  "doubleBigRate" DOUBLE PRECISION NOT NULL,
  "benchHeavyRate" DOUBLE PRECISION NOT NULL,
  "closingLineupStability" DOUBLE PRECISION NOT NULL,
  "timeoutSubstitutionRate" DOUBLE PRECISION,
  "sampleSize" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "coach_rotation_tendencies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "player_availability_projections" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "playerId" TEXT NOT NULL,
  "officialStatus" "InjuryStatus",
  "expectedAvailabilityProb" DOUBLE PRECISION NOT NULL,
  "starterStatus" "StarterStatus" NOT NULL DEFAULT 'UNKNOWN',
  "expectedMinutesRestriction" DOUBLE PRECISION,
  "loadManagementStatus" "AvailabilityConstraint" NOT NULL DEFAULT 'NONE',
  "suspensionStatus" "AvailabilityConstraint" NOT NULL DEFAULT 'NONE',
  "dataQuality" "DataQualityLevel" NOT NULL,
  "source" TEXT NOT NULL,
  "sourceTier" "SourceTier" NOT NULL,
  "sourceUpdatedAt" TIMESTAMP(3),
  "projectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "player_availability_projections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "player_opportunity_stats" (
  "id" TEXT NOT NULL,
  "playerId" TEXT NOT NULL,
  "eventId" TEXT,
  "season" TEXT NOT NULL,
  "gameDate" TIMESTAMP(3) NOT NULL,
  "minutes" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "touches" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "touchesPerMinute" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "timeOfPossessionSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "drives" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "drivesPerMinute" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "paintTouches" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "postTouches" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "passesMade" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "potentialAssists" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "potentialAssistsPerMinute" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "reboundChances" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "reboundChancesPerMinute" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "contestedReboundRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "expectedEfg" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "source" TEXT NOT NULL,
  "sourceTier" "SourceTier" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "player_opportunity_stats_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "player_shot_profiles" (
  "id" TEXT NOT NULL,
  "playerId" TEXT NOT NULL,
  "eventId" TEXT,
  "season" TEXT NOT NULL,
  "gameDate" TIMESTAMP(3),
  "minutes" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "rimAttempts" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "rimFrequency" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "rimEfficiency" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "midrangeAttempts" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "midrangeFrequency" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "midrangeEfficiency" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "corner3Attempts" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "corner3Frequency" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "corner3Efficiency" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "atb3Attempts" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "atb3Frequency" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "atb3Efficiency" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "catchShootAttempts" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "catchShootFrequency" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "catchShootEfficiency" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "pullupAttempts" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "pullupFrequency" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "pullupEfficiency" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "expectedEfg" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "source" TEXT NOT NULL,
  "sourceTier" "SourceTier" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "player_shot_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "player_play_type_stats" (
  "id" TEXT NOT NULL,
  "playerId" TEXT NOT NULL,
  "eventId" TEXT,
  "season" TEXT NOT NULL,
  "gameDate" TIMESTAMP(3),
  "playType" "PlayType" NOT NULL,
  "possessions" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "frequency" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "pointsPerPossession" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "efgPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "turnoverPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "freeThrowFrequency" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "source" TEXT NOT NULL,
  "sourceTier" "SourceTier" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "player_play_type_stats_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "team_defensive_scheme_stats" (
  "id" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "eventId" TEXT,
  "season" TEXT NOT NULL,
  "gameDate" TIMESTAMP(3),
  "switchFrequency" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "dropFrequency" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "blitzFrequency" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "trapFrequency" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "zoneFrequency" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "doubleTeamRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "pointOfAttackRating" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "helpAggressiveness" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "rimProtectionRating" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "transitionDefensePpp" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "halfCourtDefensePpp" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "corner3AllowanceRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "rimAllowanceRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "source" TEXT NOT NULL,
  "sourceTier" "SourceTier" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "team_defensive_scheme_stats_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "defensive_matchup_assignments" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "defenseTeamId" TEXT NOT NULL,
  "defenderPlayerId" TEXT NOT NULL,
  "offensivePlayerId" TEXT NOT NULL,
  "expectedPossessionShare" DOUBLE PRECISION NOT NULL,
  "confirmed" BOOLEAN NOT NULL DEFAULT false,
  "source" TEXT NOT NULL,
  "sourceTier" "SourceTier" NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "defensive_matchup_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "five_man_lineups" (
  "id" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "season" TEXT NOT NULL,
  "lineupKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "five_man_lineups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "five_man_lineup_players" (
  "id" TEXT NOT NULL,
  "lineupId" TEXT NOT NULL,
  "playerId" TEXT NOT NULL,
  "slot" INTEGER NOT NULL,
  CONSTRAINT "five_man_lineup_players_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "five_man_lineup_stats" (
  "id" TEXT NOT NULL,
  "lineupId" TEXT NOT NULL,
  "eventId" TEXT,
  "sampleStart" TIMESTAMP(3),
  "sampleEnd" TIMESTAMP(3),
  "possessions" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "minutes" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "ortg" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "drtg" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "netRating" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "pace" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "source" TEXT NOT NULL,
  "sourceTier" "SourceTier" NOT NULL,
  "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "five_man_lineup_stats_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "player_on_off_stats" (
  "id" TEXT NOT NULL,
  "playerId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "season" TEXT NOT NULL,
  "sampleStart" TIMESTAMP(3),
  "sampleEnd" TIMESTAMP(3),
  "minutesOn" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "minutesOff" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "ortgOn" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "ortgOff" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "drtgOn" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "drtgOff" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "netRatingOn" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "netRatingOff" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "paceOn" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "paceOff" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "usageDelta" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "assistRateDelta" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "reboundRateDelta" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "fgaRateDelta" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "threePointRateDelta" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "rimRateDelta" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "source" TEXT NOT NULL,
  "sourceTier" "SourceTier" NOT NULL,
  "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "player_on_off_stats_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "injury_replacement_projections" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "absentPlayerId" TEXT NOT NULL,
  "replacementPlayerId" TEXT NOT NULL,
  "minutesDelta" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "usageDelta" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "ballHandlingDelta" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "reboundChanceDelta" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "fgaDelta" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "threePointAttemptDelta" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "defensiveImpact" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "dataQuality" "DataQualityLevel" NOT NULL,
  "projectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "injury_replacement_projections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "post_bet_reviews" (
  "id" TEXT NOT NULL,
  "betSlipItemId" TEXT NOT NULL,
  "processGrade" "ProcessGrade" NOT NULL,
  "expectedMinutes" DOUBLE PRECISION,
  "actualMinutes" DOUBLE PRECISION,
  "minutesProjectionError" DOUBLE PRECISION,
  "expectedUsage" DOUBLE PRECISION,
  "actualUsage" DOUBLE PRECISION,
  "usageProjectionError" DOUBLE PRECISION,
  "expectedPace" DOUBLE PRECISION,
  "actualPace" DOUBLE PRECISION,
  "paceProjectionError" DOUBLE PRECISION,
  "rotationError" BOOLEAN NOT NULL DEFAULT false,
  "matchupError" BOOLEAN NOT NULL DEFAULT false,
  "marketTimingError" BOOLEAN NOT NULL DEFAULT false,
  "varianceDominated" BOOLEAN NOT NULL DEFAULT false,
  "foulTrouble" BOOLEAN NOT NULL DEFAULT false,
  "blowout" BOOLEAN NOT NULL DEFAULT false,
  "inGameInjury" BOOLEAN NOT NULL DEFAULT false,
  "unexpectedCoachingDecision" BOOLEAN NOT NULL DEFAULT false,
  "primaryError" "ErrorAttributionType",
  "notes" TEXT,
  "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "post_bet_reviews_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "performance_slices" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "modelId" TEXT,
  "period" TEXT NOT NULL,
  "dimension" "PerformanceDimension" NOT NULL,
  "dimensionValue" TEXT NOT NULL,
  "totalBets" INTEGER NOT NULL DEFAULT 0,
  "wins" INTEGER NOT NULL DEFAULT 0,
  "losses" INTEGER NOT NULL DEFAULT 0,
  "pushes" INTEGER NOT NULL DEFAULT 0,
  "units" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "roi" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "averageOdds" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "clvRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "averageClv" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "performance_slices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "referees_nbaId_key" ON "referees"("nbaId");
CREATE INDEX "referees_name_idx" ON "referees"("name");
CREATE UNIQUE INDEX "referee_assignments_eventId_refereeId_key" ON "referee_assignments"("eventId", "refereeId");
CREATE INDEX "referee_assignments_eventId_idx" ON "referee_assignments"("eventId");
CREATE INDEX "referee_assignments_refereeId_idx" ON "referee_assignments"("refereeId");
CREATE UNIQUE INDEX "referee_metrics_refereeId_season_key" ON "referee_metrics"("refereeId", "season");
CREATE INDEX "referee_metrics_season_idx" ON "referee_metrics"("season");
CREATE UNIQUE INDEX "game_environment_eventId_key" ON "game_environment"("eventId");
CREATE INDEX "game_environment_calculatedAt_idx" ON "game_environment"("calculatedAt");
CREATE UNIQUE INDEX "game_lineups_eventId_teamId_lineupType_key" ON "game_lineups"("eventId", "teamId", "lineupType");
CREATE INDEX "game_lineups_eventId_idx" ON "game_lineups"("eventId");
CREATE INDEX "game_lineups_teamId_idx" ON "game_lineups"("teamId");
CREATE INDEX "game_lineups_status_idx" ON "game_lineups"("status");
CREATE UNIQUE INDEX "game_lineup_players_lineupId_playerId_key" ON "game_lineup_players"("lineupId", "playerId");
CREATE INDEX "game_lineup_players_playerId_idx" ON "game_lineup_players"("playerId");
CREATE UNIQUE INDEX "rotation_projections_eventId_playerId_key" ON "rotation_projections"("eventId", "playerId");
CREATE INDEX "rotation_projections_eventId_idx" ON "rotation_projections"("eventId");
CREATE INDEX "rotation_projections_teamId_idx" ON "rotation_projections"("teamId");
CREATE INDEX "rotation_projections_playerId_idx" ON "rotation_projections"("playerId");
CREATE INDEX "rotation_projections_starterStatus_idx" ON "rotation_projections"("starterStatus");
CREATE UNIQUE INDEX "coach_rotation_tendencies_teamId_season_coachName_key" ON "coach_rotation_tendencies"("teamId", "season", "coachName");
CREATE INDEX "coach_rotation_tendencies_teamId_idx" ON "coach_rotation_tendencies"("teamId");
CREATE INDEX "coach_rotation_tendencies_season_idx" ON "coach_rotation_tendencies"("season");
CREATE UNIQUE INDEX "player_availability_projections_eventId_playerId_key" ON "player_availability_projections"("eventId", "playerId");
CREATE INDEX "player_availability_projections_eventId_idx" ON "player_availability_projections"("eventId");
CREATE INDEX "player_availability_projections_playerId_idx" ON "player_availability_projections"("playerId");
CREATE INDEX "player_availability_projections_officialStatus_idx" ON "player_availability_projections"("officialStatus");
CREATE INDEX "player_availability_projections_dataQuality_idx" ON "player_availability_projections"("dataQuality");
CREATE UNIQUE INDEX "player_opportunity_stats_playerId_gameDate_source_key" ON "player_opportunity_stats"("playerId", "gameDate", "source");
CREATE INDEX "player_opportunity_stats_playerId_gameDate_idx" ON "player_opportunity_stats"("playerId", "gameDate");
CREATE INDEX "player_opportunity_stats_eventId_idx" ON "player_opportunity_stats"("eventId");
CREATE INDEX "player_opportunity_stats_season_idx" ON "player_opportunity_stats"("season");
CREATE INDEX "player_shot_profiles_playerId_gameDate_idx" ON "player_shot_profiles"("playerId", "gameDate");
CREATE INDEX "player_shot_profiles_eventId_idx" ON "player_shot_profiles"("eventId");
CREATE INDEX "player_shot_profiles_season_idx" ON "player_shot_profiles"("season");
CREATE INDEX "player_play_type_stats_playerId_playType_idx" ON "player_play_type_stats"("playerId", "playType");
CREATE INDEX "player_play_type_stats_eventId_idx" ON "player_play_type_stats"("eventId");
CREATE INDEX "player_play_type_stats_season_idx" ON "player_play_type_stats"("season");
CREATE INDEX "team_defensive_scheme_stats_teamId_gameDate_idx" ON "team_defensive_scheme_stats"("teamId", "gameDate");
CREATE INDEX "team_defensive_scheme_stats_eventId_idx" ON "team_defensive_scheme_stats"("eventId");
CREATE INDEX "team_defensive_scheme_stats_season_idx" ON "team_defensive_scheme_stats"("season");
CREATE UNIQUE INDEX "defensive_matchup_assignments_eventId_defenderPlayerId_offensivePlayerId_key" ON "defensive_matchup_assignments"("eventId", "defenderPlayerId", "offensivePlayerId");
CREATE INDEX "defensive_matchup_assignments_eventId_idx" ON "defensive_matchup_assignments"("eventId");
CREATE INDEX "defensive_matchup_assignments_defenderPlayerId_idx" ON "defensive_matchup_assignments"("defenderPlayerId");
CREATE INDEX "defensive_matchup_assignments_offensivePlayerId_idx" ON "defensive_matchup_assignments"("offensivePlayerId");
CREATE UNIQUE INDEX "five_man_lineups_teamId_season_lineupKey_key" ON "five_man_lineups"("teamId", "season", "lineupKey");
CREATE INDEX "five_man_lineups_teamId_idx" ON "five_man_lineups"("teamId");
CREATE INDEX "five_man_lineups_season_idx" ON "five_man_lineups"("season");
CREATE UNIQUE INDEX "five_man_lineup_players_lineupId_playerId_key" ON "five_man_lineup_players"("lineupId", "playerId");
CREATE UNIQUE INDEX "five_man_lineup_players_lineupId_slot_key" ON "five_man_lineup_players"("lineupId", "slot");
CREATE INDEX "five_man_lineup_players_playerId_idx" ON "five_man_lineup_players"("playerId");
CREATE INDEX "five_man_lineup_stats_lineupId_idx" ON "five_man_lineup_stats"("lineupId");
CREATE INDEX "five_man_lineup_stats_eventId_idx" ON "five_man_lineup_stats"("eventId");
CREATE INDEX "five_man_lineup_stats_calculatedAt_idx" ON "five_man_lineup_stats"("calculatedAt");
CREATE INDEX "player_on_off_stats_playerId_season_idx" ON "player_on_off_stats"("playerId", "season");
CREATE INDEX "player_on_off_stats_teamId_season_idx" ON "player_on_off_stats"("teamId", "season");
CREATE INDEX "player_on_off_stats_calculatedAt_idx" ON "player_on_off_stats"("calculatedAt");
CREATE UNIQUE INDEX "injury_replacement_projections_eventId_absentPlayerId_replacementPlayerId_key" ON "injury_replacement_projections"("eventId", "absentPlayerId", "replacementPlayerId");
CREATE INDEX "injury_replacement_projections_eventId_idx" ON "injury_replacement_projections"("eventId");
CREATE INDEX "injury_replacement_projections_absentPlayerId_idx" ON "injury_replacement_projections"("absentPlayerId");
CREATE INDEX "injury_replacement_projections_replacementPlayerId_idx" ON "injury_replacement_projections"("replacementPlayerId");
CREATE UNIQUE INDEX "post_bet_reviews_betSlipItemId_key" ON "post_bet_reviews"("betSlipItemId");
CREATE INDEX "post_bet_reviews_primaryError_idx" ON "post_bet_reviews"("primaryError");
CREATE INDEX "post_bet_reviews_reviewedAt_idx" ON "post_bet_reviews"("reviewedAt");
CREATE INDEX "performance_slices_userId_idx" ON "performance_slices"("userId");
CREATE INDEX "performance_slices_modelId_idx" ON "performance_slices"("modelId");
CREATE INDEX "performance_slices_dimension_dimensionValue_idx" ON "performance_slices"("dimension", "dimensionValue");
CREATE INDEX "performance_slices_calculatedAt_idx" ON "performance_slices"("calculatedAt");
CREATE INDEX "bet_slip_items_bookId_idx" ON "bet_slip_items"("bookId");
CREATE INDEX "bet_slip_items_propStatType_idx" ON "bet_slip_items"("propStatType");
CREATE INDEX "bet_slip_items_confidenceBucket_idx" ON "bet_slip_items"("confidenceBucket");
CREATE INDEX "bet_slip_items_seasonPhase_idx" ON "bet_slip_items"("seasonPhase");

ALTER TABLE "bet_slip_items" ADD CONSTRAINT "bet_slip_items_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "referee_assignments" ADD CONSTRAINT "referee_assignments_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "referee_assignments" ADD CONSTRAINT "referee_assignments_refereeId_fkey" FOREIGN KEY ("refereeId") REFERENCES "referees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "referee_metrics" ADD CONSTRAINT "referee_metrics_refereeId_fkey" FOREIGN KEY ("refereeId") REFERENCES "referees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "game_environment" ADD CONSTRAINT "game_environment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "game_lineups" ADD CONSTRAINT "game_lineups_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "game_lineups" ADD CONSTRAINT "game_lineups_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "game_lineup_players" ADD CONSTRAINT "game_lineup_players_lineupId_fkey" FOREIGN KEY ("lineupId") REFERENCES "game_lineups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "game_lineup_players" ADD CONSTRAINT "game_lineup_players_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rotation_projections" ADD CONSTRAINT "rotation_projections_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rotation_projections" ADD CONSTRAINT "rotation_projections_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rotation_projections" ADD CONSTRAINT "rotation_projections_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "coach_rotation_tendencies" ADD CONSTRAINT "coach_rotation_tendencies_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "player_availability_projections" ADD CONSTRAINT "player_availability_projections_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "player_availability_projections" ADD CONSTRAINT "player_availability_projections_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "player_opportunity_stats" ADD CONSTRAINT "player_opportunity_stats_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "player_opportunity_stats" ADD CONSTRAINT "player_opportunity_stats_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "player_shot_profiles" ADD CONSTRAINT "player_shot_profiles_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "player_shot_profiles" ADD CONSTRAINT "player_shot_profiles_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "player_play_type_stats" ADD CONSTRAINT "player_play_type_stats_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "player_play_type_stats" ADD CONSTRAINT "player_play_type_stats_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "team_defensive_scheme_stats" ADD CONSTRAINT "team_defensive_scheme_stats_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "team_defensive_scheme_stats" ADD CONSTRAINT "team_defensive_scheme_stats_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "defensive_matchup_assignments" ADD CONSTRAINT "defensive_matchup_assignments_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "defensive_matchup_assignments" ADD CONSTRAINT "defensive_matchup_assignments_defenseTeamId_fkey" FOREIGN KEY ("defenseTeamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "defensive_matchup_assignments" ADD CONSTRAINT "defensive_matchup_assignments_defenderPlayerId_fkey" FOREIGN KEY ("defenderPlayerId") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "defensive_matchup_assignments" ADD CONSTRAINT "defensive_matchup_assignments_offensivePlayerId_fkey" FOREIGN KEY ("offensivePlayerId") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "five_man_lineups" ADD CONSTRAINT "five_man_lineups_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "five_man_lineup_players" ADD CONSTRAINT "five_man_lineup_players_lineupId_fkey" FOREIGN KEY ("lineupId") REFERENCES "five_man_lineups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "five_man_lineup_players" ADD CONSTRAINT "five_man_lineup_players_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "five_man_lineup_stats" ADD CONSTRAINT "five_man_lineup_stats_lineupId_fkey" FOREIGN KEY ("lineupId") REFERENCES "five_man_lineups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "five_man_lineup_stats" ADD CONSTRAINT "five_man_lineup_stats_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "player_on_off_stats" ADD CONSTRAINT "player_on_off_stats_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "player_on_off_stats" ADD CONSTRAINT "player_on_off_stats_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "injury_replacement_projections" ADD CONSTRAINT "injury_replacement_projections_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "injury_replacement_projections" ADD CONSTRAINT "injury_replacement_projections_absentPlayerId_fkey" FOREIGN KEY ("absentPlayerId") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "injury_replacement_projections" ADD CONSTRAINT "injury_replacement_projections_replacementPlayerId_fkey" FOREIGN KEY ("replacementPlayerId") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "post_bet_reviews" ADD CONSTRAINT "post_bet_reviews_betSlipItemId_fkey" FOREIGN KEY ("betSlipItemId") REFERENCES "bet_slip_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "performance_slices" ADD CONSTRAINT "performance_slices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "performance_slices" ADD CONSTRAINT "performance_slices_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "custom_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;
