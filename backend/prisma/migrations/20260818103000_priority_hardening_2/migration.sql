-- Opportunity-First priority hardening II
-- Additive only. Historical catch/pull-up zeros are intentionally not rewritten:
-- the prior schema cannot distinguish a genuine observed zero from unavailable data.

CREATE TYPE "WagerStructure" AS ENUM ('SINGLE_BATCH', 'PARLAY');
CREATE TYPE "LegSettlementStatus" AS ENUM ('PENDING', 'WIN', 'LOSS', 'PUSH', 'VOID');
CREATE TYPE "ReportingSourceClass" AS ENUM (
  'OFFICIAL_NBA',
  'OFFICIAL_TEAM',
  'COACH_DIRECT',
  'NATIONAL_REPORTER',
  'BEAT_REPORTER',
  'AGGREGATOR',
  'UNKNOWN'
);

ALTER TYPE "BetSlipStatus" ADD VALUE IF NOT EXISTS 'SETTLED';
ALTER TYPE "BetSlipStatus" ADD VALUE IF NOT EXISTS 'PUSH';

ALTER TABLE "bet_slips"
  ADD COLUMN "structure" "WagerStructure" NOT NULL DEFAULT 'SINGLE_BATCH',
  ADD COLUMN "ticketStake" DOUBLE PRECISION,
  ADD COLUMN "settlementPayout" DOUBLE PRECISION,
  ADD COLUMN "settlementProfitLoss" DOUBLE PRECISION,
  ADD COLUMN "settledAt" TIMESTAMP(3);

CREATE INDEX "bet_slips_structure_idx" ON "bet_slips"("structure");
CREATE INDEX "bet_slips_status_idx" ON "bet_slips"("status");

ALTER TABLE "bet_slip_items"
  ADD COLUMN "settlementStatus" "LegSettlementStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "actualValue" DOUBLE PRECISION,
  ADD COLUMN "settlementSource" TEXT,
  ADD COLUMN "settledAt" TIMESTAMP(3);

CREATE INDEX "bet_slip_items_settlementStatus_idx" ON "bet_slip_items"("settlementStatus");

ALTER TABLE "injury_reports"
  ADD COLUMN "sourceTier" "SourceTier",
  ADD COLUMN "dataQuality" "DataQualityLevel";

CREATE INDEX "injury_reports_sourceTier_idx" ON "injury_reports"("sourceTier");

ALTER TABLE "news_items"
  ADD COLUMN "sourceKey" TEXT,
  ADD COLUMN "sourceTier" "SourceTier",
  ADD COLUMN "sourceClass" "ReportingSourceClass",
  ADD COLUMN "dataQuality" "DataQualityLevel";

CREATE INDEX "news_items_sourceTier_idx" ON "news_items"("sourceTier");
CREATE INDEX "news_items_sourceClass_idx" ON "news_items"("sourceClass");

ALTER TABLE "player_shot_profiles"
  ALTER COLUMN "catchShootAttempts" DROP DEFAULT,
  ALTER COLUMN "catchShootAttempts" DROP NOT NULL,
  ALTER COLUMN "catchShootFrequency" DROP DEFAULT,
  ALTER COLUMN "catchShootFrequency" DROP NOT NULL,
  ALTER COLUMN "catchShootEfficiency" DROP DEFAULT,
  ALTER COLUMN "catchShootEfficiency" DROP NOT NULL,
  ALTER COLUMN "pullupAttempts" DROP DEFAULT,
  ALTER COLUMN "pullupAttempts" DROP NOT NULL,
  ALTER COLUMN "pullupFrequency" DROP DEFAULT,
  ALTER COLUMN "pullupFrequency" DROP NOT NULL,
  ALTER COLUMN "pullupEfficiency" DROP DEFAULT,
  ALTER COLUMN "pullupEfficiency" DROP NOT NULL;
