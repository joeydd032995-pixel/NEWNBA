-- Recommendation-time Opportunity-First projection snapshots.
-- One immutable snapshot per tracked wager item preserves the exact model state
-- used when the recommendation was recorded.

CREATE TYPE "NewsDecisionClass" AS ENUM ('BET_NOW', 'WAIT', 'PASS');

CREATE TABLE "wager_projection_snapshots" (
    "id" TEXT NOT NULL,
    "betSlipItemId" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "analysisMode" "AnalysisMode" NOT NULL,
    "statType" "PropStatType" NOT NULL,
    "seed" INTEGER NOT NULL,
    "trials" INTEGER NOT NULL,
    "mean" DOUBLE PRECISION NOT NULL,
    "median" DOUBLE PRECISION NOT NULL,
    "stdDev" DOUBLE PRECISION NOT NULL,
    "p05" DOUBLE PRECISION NOT NULL,
    "p10" DOUBLE PRECISION NOT NULL,
    "p25" DOUBLE PRECISION NOT NULL,
    "p50" DOUBLE PRECISION NOT NULL,
    "p75" DOUBLE PRECISION NOT NULL,
    "p90" DOUBLE PRECISION NOT NULL,
    "p95" DOUBLE PRECISION NOT NULL,
    "minutesFloor" DOUBLE PRECISION NOT NULL,
    "minutesMedian" DOUBLE PRECISION NOT NULL,
    "minutesCeiling" DOUBLE PRECISION NOT NULL,
    "minutesStdDev" DOUBLE PRECISION NOT NULL,
    "opportunityRatePerMinute" DOUBLE PRECISION NOT NULL,
    "opportunityRateSource" TEXT NOT NULL,
    "conversionRate" DOUBLE PRECISION NOT NULL,
    "contextAdjustment" DOUBLE PRECISION NOT NULL,
    "paceAdjustment" DOUBLE PRECISION NOT NULL,
    "pppAdjustment" DOUBLE PRECISION NOT NULL,
    "uncertaintyMinutes" DOUBLE PRECISION NOT NULL,
    "uncertaintyOpportunity" DOUBLE PRECISION NOT NULL,
    "uncertaintyConversion" DOUBLE PRECISION NOT NULL,
    "uncertaintyContext" DOUBLE PRECISION NOT NULL,
    "uncertaintyPace" DOUBLE PRECISION NOT NULL,
    "uncertaintyTotal" DOUBLE PRECISION NOT NULL,
    "dataQuality" "DataQualityLevel" NOT NULL,
    "modelProbability" DOUBLE PRECISION NOT NULL,
    "rawImpliedProbability" DOUBLE PRECISION,
    "noVigProbability" DOUBLE PRECISION,
    "estimatedEv" DOUBLE PRECISION,
    "edgeProbability" DOUBLE PRECISION,
    "decisionClass" "DecisionClass",
    "newsDecision" "NewsDecisionClass",
    "marketLine" DOUBLE PRECISION,
    "marketOdds" DOUBLE PRECISION,
    "playableToLine" DOUBLE PRECISION,
    "playableToOdds" DOUBLE PRECISION,
    "qualityReasonCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wager_projection_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "wager_projection_snapshots_betSlipItemId_key"
    ON "wager_projection_snapshots"("betSlipItemId");
CREATE INDEX "wager_projection_snapshots_statType_idx"
    ON "wager_projection_snapshots"("statType");
CREATE INDEX "wager_projection_snapshots_dataQuality_idx"
    ON "wager_projection_snapshots"("dataQuality");
CREATE INDEX "wager_projection_snapshots_decisionClass_idx"
    ON "wager_projection_snapshots"("decisionClass");
CREATE INDEX "wager_projection_snapshots_createdAt_idx"
    ON "wager_projection_snapshots"("createdAt");

ALTER TABLE "wager_projection_snapshots"
    ADD CONSTRAINT "wager_projection_snapshots_betSlipItemId_fkey"
    FOREIGN KEY ("betSlipItemId") REFERENCES "bet_slip_items"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
