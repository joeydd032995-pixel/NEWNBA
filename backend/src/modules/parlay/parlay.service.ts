import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { PropStatType } from '@prisma/client';
import { SGPLegInputDto } from './dto/parlay.dto';

// ─── Leg type classification ─────────────────────────────────────────────────

type LegType =
  | 'PLAYER_POINTS_OVER'   | 'PLAYER_POINTS_UNDER'
  | 'PLAYER_REBOUNDS_OVER' | 'PLAYER_REBOUNDS_UNDER'
  | 'PLAYER_ASSISTS_OVER'  | 'PLAYER_ASSISTS_UNDER'
  | 'PLAYER_THREES_OVER'   | 'PLAYER_THREES_UNDER'
  | 'PLAYER_PRA_OVER'      | 'PLAYER_PRA_UNDER'
  | 'PLAYER_PR_OVER'       | 'PLAYER_PR_UNDER'
  | 'PLAYER_PA_OVER'       | 'PLAYER_PA_UNDER'
  | 'PLAYER_STEALS_OVER'   | 'PLAYER_STEALS_UNDER'
  | 'PLAYER_BLOCKS_OVER'   | 'PLAYER_BLOCKS_UNDER'
  | 'TOTAL_OVER'  | 'TOTAL_UNDER'
  | 'ML_HOME'     | 'ML_AWAY'
  | 'SPREAD_HOME' | 'SPREAD_AWAY'
  | 'UNKNOWN';

function getLegType(marketType: string, propStatType: string | null, outcome: string): LegType {
  if (marketType === 'PLAYER_PROP' && propStatType) {
    const dir = outcome === 'over' ? 'OVER' : 'UNDER';
    return `PLAYER_${propStatType}_${dir}` as LegType;
  }
  if (marketType === 'TOTAL') return outcome === 'over' ? 'TOTAL_OVER' : 'TOTAL_UNDER';
  if (marketType === 'MONEYLINE') return outcome === 'home' ? 'ML_HOME' : 'ML_AWAY';
  if (marketType === 'SPREAD') return outcome === 'home' ? 'SPREAD_HOME' : 'SPREAD_AWAY';
  return 'UNKNOWN';
}

// ─── Correlation rules ───────────────────────────────────────────────────────
// r > 0 → positively correlated (both more likely to hit together)
// r < 0 → negatively correlated (one hitting hurts the other)
// r = 0 → independent (different games always = 0)

function computeCorrelation(
  typeA: LegType, teamIdA: string | null,
  typeB: LegType, teamIdB: string | null,
): number {
  // Same leg (near-duplicate) → extremely correlated
  if (typeA === typeB && teamIdA === teamIdB) return 0.95;

  const sameTeam  = teamIdA && teamIdB && teamIdA === teamIdB;
  const oppTeam   = teamIdA && teamIdB && teamIdA !== teamIdB;

  // ML + Spread same side (near-duplicate)
  if (typeA === 'ML_HOME'  && typeB === 'SPREAD_HOME') return 0.70;
  if (typeA === 'ML_AWAY'  && typeB === 'SPREAD_AWAY') return 0.70;
  if (typeA === 'SPREAD_HOME' && typeB === 'ML_HOME')  return 0.70;
  if (typeA === 'SPREAD_AWAY' && typeB === 'ML_AWAY')  return 0.70;

  // ML + Spread opposing sides (contradictory)
  if (typeA === 'ML_HOME'  && typeB === 'SPREAD_AWAY') return -0.80;
  if (typeA === 'ML_AWAY'  && typeB === 'SPREAD_HOME') return -0.80;
  if (typeA === 'SPREAD_HOME' && typeB === 'ML_AWAY')  return -0.80;
  if (typeA === 'SPREAD_AWAY' && typeB === 'ML_HOME')  return -0.80;

  // ML home + ML away = contradictory
  if ((typeA === 'ML_HOME'  && typeB === 'ML_AWAY') ||
      (typeA === 'ML_AWAY'  && typeB === 'ML_HOME'))  return -0.99;
  if ((typeA === 'SPREAD_HOME' && typeB === 'SPREAD_AWAY') ||
      (typeA === 'SPREAD_AWAY' && typeB === 'SPREAD_HOME')) return -0.99;
  if ((typeA === 'TOTAL_OVER'  && typeB === 'TOTAL_UNDER') ||
      (typeA === 'TOTAL_UNDER' && typeB === 'TOTAL_OVER'))  return -0.99;

  // Player OVER + Total OVER → positive (more player scoring = higher total)
  const isPlayerOver  = typeA.startsWith('PLAYER_') && typeA.endsWith('_OVER');
  const isPlayerOverB = typeB.startsWith('PLAYER_') && typeB.endsWith('_OVER');
  const isPlayerUnder  = typeA.startsWith('PLAYER_') && typeA.endsWith('_UNDER');
  const isPlayerUnderB = typeB.startsWith('PLAYER_') && typeB.endsWith('_UNDER');

  if (isPlayerOver  && typeB === 'TOTAL_OVER')   return 0.38;
  if (typeA === 'TOTAL_OVER'  && isPlayerOverB)  return 0.38;
  if (isPlayerUnder && typeB === 'TOTAL_UNDER')  return 0.30;
  if (typeA === 'TOTAL_UNDER' && isPlayerUnderB) return 0.30;

  // Player OVER + Total UNDER → negative
  if (isPlayerOver  && typeB === 'TOTAL_UNDER')  return -0.32;
  if (typeA === 'TOTAL_UNDER' && isPlayerOverB)  return -0.32;
  if (isPlayerUnder && typeB === 'TOTAL_OVER')   return -0.32;
  if (typeA === 'TOTAL_OVER'  && isPlayerUnderB) return -0.32;

  // Player OVER + Team Win (same team) → positive
  const isPlayerProp  = typeA.startsWith('PLAYER_');
  const isPlayerPropB = typeB.startsWith('PLAYER_');
  if (isPlayerOver && typeB === 'ML_HOME' && sameTeam) return 0.28;
  if (isPlayerOver && typeB === 'ML_AWAY' && sameTeam) return 0.28;
  if (isPlayerOverB && typeA === 'ML_HOME' && sameTeam) return 0.28;
  if (isPlayerOverB && typeA === 'ML_AWAY' && sameTeam) return 0.28;

  // Player OVER + Team Win (opposite team) → negative
  if (isPlayerOver && typeB === 'ML_HOME' && oppTeam) return -0.15;
  if (isPlayerOver && typeB === 'ML_AWAY' && oppTeam) return -0.15;
  if (isPlayerOverB && typeA === 'ML_HOME' && oppTeam) return -0.15;
  if (isPlayerOverB && typeA === 'ML_AWAY' && oppTeam) return -0.15;

  // Player OVER + Team Spread same team → moderate positive
  if (isPlayerOver && typeB === 'SPREAD_HOME' && sameTeam) return 0.22;
  if (isPlayerOver && typeB === 'SPREAD_AWAY' && sameTeam) return 0.22;
  if (isPlayerOverB && typeA === 'SPREAD_HOME' && sameTeam) return 0.22;
  if (isPlayerOverB && typeA === 'SPREAD_AWAY' && sameTeam) return 0.22;

  // Player + Total OVER → favorite covers more
  if (typeA === 'TOTAL_OVER' && typeB === 'SPREAD_HOME') return 0.25;
  if (typeA === 'TOTAL_OVER' && typeB === 'SPREAD_AWAY') return 0.25;
  if (typeA === 'SPREAD_HOME' && typeB === 'TOTAL_OVER') return 0.25;
  if (typeA === 'SPREAD_AWAY' && typeB === 'TOTAL_OVER') return 0.25;

  // Two player props same team → slight positive (same game flow)
  if (isPlayerProp && isPlayerPropB && sameTeam) return 0.13;

  // Two player props opposing teams → slight negative
  if (isPlayerProp && isPlayerPropB && oppTeam) return -0.05;

  return 0;
}

// ─── Joint probability for n correlated legs ─────────────────────────────────
// Uses pairwise Pearson-for-binary approximation:
//   P(A∩B) ≈ P(A)·P(B) + r·σA·σB  where σ = sqrt(P(1-P))
// Extended to n legs by summing all pairwise adjustments onto the independent product.

function jointProbability(probs: number[], corrMatrix: number[][]): number {
  const n = probs.length;
  let joint = probs.reduce((p, q) => p * q, 1);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const r = corrMatrix[i][j];
      const sigI = Math.sqrt(probs[i] * (1 - probs[i]));
      const sigJ = Math.sqrt(probs[j] * (1 - probs[j]));
      joint += r * sigI * sigJ;
    }
  }
  return Math.max(0.001, Math.min(0.999, joint));
}

function americanToDecimal(odds: number): number {
  return odds > 0 ? odds / 100 + 1 : 100 / Math.abs(odds) + 1;
}

function decimalToAmerican(decimal: number): number {
  if (decimal >= 2) return Math.round((decimal - 1) * 100);
  return Math.round(-100 / (decimal - 1));
}

// ─── Service ──────────────────────────────────────────────────────────────────

export type SGPLegInput = SGPLegInputDto;

@Injectable()
export class ParlayService {
  constructor(
    private prisma: PrismaService,
    private analyticsService: AnalyticsService,
  ) {}

  // ─ Fetch all active markets for an event (for leg picker) ─────────────────
  async getEventMarkets(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: {
        homeTeam: true,
        awayTeam: true,
        markets: {
          where: { isActive: true },
          include: {
            player: { include: { team: true } },
            marketOdds: { where: { isOpen: true }, include: { book: true } },
          },
          orderBy: { marketType: 'asc' },
        },
      },
    });
    if (!event) return null;

    const legs = event.markets.map((m) => {
      const byOutcome: Record<string, any> = {};
      for (const mo of m.marketOdds) {
        if (!byOutcome[mo.outcome] || mo.odds > byOutcome[mo.outcome].odds) {
          byOutcome[mo.outcome] = { outcome: mo.outcome, odds: mo.odds, line: mo.line, bookName: mo.book.name };
        }
      }
      return {
        marketId: m.id,
        marketType: m.marketType,
        propStatType: m.propStatType,
        description: m.description,
        player: m.player ? { id: m.player.id, name: m.player.name, teamId: m.player.teamId, teamAbbr: m.player.team?.abbreviation } : null,
        outcomes: Object.values(byOutcome),
      };
    }).filter((m) => m.outcomes.length > 0);

    return {
      eventId,
      home: event.homeTeam.abbreviation,
      away: event.awayTeam.abbreviation,
      homeTeamId: event.homeTeamId,
      awayTeamId: event.awayTeamId,
      startTime: event.startTime,
      legs,
    };
  }

  // ─ Core SGP analysis ───────────────────────────────────────────────────────
  async analyzeSGP(eventId: string, legInputs: SGPLegInput[]) {
    if (legInputs.length < 2) throw new Error('SGP requires at least 2 legs');

    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: { homeTeam: true, awayTeam: true },
    });
    if (!event) throw new Error('Event not found');

    // Load each market
    const legData = await Promise.all(
      legInputs.map(async (input) => {
        const market = await this.prisma.market.findUnique({
          where: { id: input.marketId },
          include: {
            player: { include: { team: true } },
            marketOdds: { where: { isOpen: true }, include: { book: true } },
          },
        });
        if (!market) throw new Error(`Market ${input.marketId} not found`);

        // Best odds for this outcome
        const oddsRows = market.marketOdds.filter((o) => o.outcome === input.outcome);
        if (!oddsRows.length) throw new Error(`No odds for outcome ${input.outcome}`);
        const best = oddsRows.reduce((a, b) => (a.odds > b.odds ? a : b));

        // No-vig true prob using all outcomes for this market
        const allOutcomeOdds = market.marketOdds.map((o) => o.odds);
        const noVig = allOutcomeOdds.length >= 2
          ? this.analyticsService.removeVig(allOutcomeOdds)
          : null;
        const outcomeIdx = market.marketOdds.findIndex((o) => o.outcome === input.outcome && o.id === best.id);
        const trueProb = noVig && outcomeIdx >= 0 ? noVig[outcomeIdx] : 0.5;

        const ev = this.analyticsService.calcEV(trueProb, best.odds);

        const legType = getLegType(
          market.marketType,
          market.propStatType,
          input.outcome,
        );

        const teamId = market.player?.teamId
          ?? (input.outcome === 'home' ? event.homeTeamId : event.awayTeamId);

        return {
          marketId: input.marketId,
          outcome: input.outcome,
          marketType: market.marketType,
          propStatType: market.propStatType,
          description: market.description,
          player: market.player ? { name: market.player.name, teamId: market.player.teamId, teamAbbr: market.player.team?.abbreviation } : null,
          bestOdds: best.odds,
          bestBook: best.book.name,
          line: best.line,
          trueProb,
          ev,
          legType,
          teamId,
        };
      }),
    );

    // Build n×n correlation matrix
    const n = legData.length;
    const corrMatrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      corrMatrix[i][i] = 1;
      for (let j = i + 1; j < n; j++) {
        const r = computeCorrelation(
          legData[i].legType, legData[i].teamId,
          legData[j].legType, legData[j].teamId,
        );
        corrMatrix[i][j] = r;
        corrMatrix[j][i] = r;
      }
    }

    // Independent parlay
    const probs = legData.map((l) => l.trueProb);
    const indepProb = probs.reduce((p, q) => p * q, 1);
    const parlayDecimal = legData.reduce((p, l) => p * americanToDecimal(l.bestOdds), 1);
    const parlayPayout = parlayDecimal; // decimal odds (payout per $1 staked)

    // Correlation-adjusted joint probability
    const corrProb = jointProbability(probs, corrMatrix);

    // EV: EV% = (trueProb × payout) - 1   (decimal, per $1 stake)
    const indepEV = indepProb * parlayPayout - 1;
    const corrEV  = corrProb  * parlayPayout - 1;

    // Summary of correlation pairs
    const correlationPairs: Array<{ legA: number; legB: number; correlation: number; label: string; impact: string }> = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const r = corrMatrix[i][j];
        correlationPairs.push({
          legA: i,
          legB: j,
          correlation: r,
          label: r > 0.5 ? 'Strong +' : r > 0.2 ? 'Moderate +' : r > 0 ? 'Slight +' : r < -0.5 ? 'Strong −' : r < -0.2 ? 'Moderate −' : r < 0 ? 'Slight −' : 'Independent',
          impact: r > 0 ? 'boost' : r < 0 ? 'penalty' : 'none',
        });
      }
    }

    const avgCorr = correlationPairs.length > 0
      ? correlationPairs.reduce((s, p) => s + p.correlation, 0) / correlationPairs.length
      : 0;

    return {
      event: { id: event.id, home: event.homeTeam.abbreviation, away: event.awayTeam.abbreviation, startTime: event.startTime },
      legs: legData,
      corrMatrix,
      correlationPairs,
      avgCorrelation: Math.round(avgCorr * 100) / 100,
      parlayOddsDecimal: Math.round(parlayDecimal * 100) / 100,
      parlayOddsAmerican: decimalToAmerican(parlayDecimal),
      indepProb:  Math.round(indepProb  * 10000) / 100, // %
      corrProb:   Math.round(corrProb   * 10000) / 100, // %
      indepEVPct: Math.round(indepEV  * 10000) / 100,   // %
      corrEVPct:  Math.round(corrEV   * 10000) / 100,   // %
      evImprovementPct: Math.round((corrEV - indepEV) * 10000) / 100,
    };
  }

  // ─ Suggest best SGP legs for an event ─────────────────────────────────────
  async suggestLegs(eventId: string, maxLegs = 5) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: {
        homeTeam: true,
        awayTeam: true,
        markets: {
          where: { isActive: true },
          include: {
            player: { include: { team: true } },
            marketOdds: { where: { isOpen: true } },
          },
        },
      },
    });
    if (!event) return null;

    // Score each leg: trueProb + EV
    type ScoredLeg = {
      marketId: string; outcome: string; legType: LegType; teamId: string | null;
      trueProb: number; evPct: number; odds: number; score: number;
      marketType: string; propStatType: string | null;
      playerName: string | null; description: string | null;
    };

    const candidates: ScoredLeg[] = [];

    for (const market of event.markets) {
      if (market.marketOdds.length === 0) continue;

      const oddsArr = market.marketOdds.map((o) => o.odds);
      const noVig = oddsArr.length >= 2 ? this.analyticsService.removeVig(oddsArr) : null;

      market.marketOdds.forEach((mo, idx) => {
        const trueProb = noVig?.[idx] ?? 0.5;
        const ev = this.analyticsService.calcEV(trueProb, mo.odds);
        if (!ev.isPositiveEV) return; // only suggest +EV legs

        const legType = getLegType(market.marketType, market.propStatType, mo.outcome);
        const teamId = market.player?.teamId
          ?? (mo.outcome === 'home' ? event.homeTeamId : event.awayTeamId);

        candidates.push({
          marketId: market.id,
          outcome: mo.outcome,
          legType,
          teamId,
          trueProb,
          evPct: ev.evPct * 100,
          odds: mo.odds,
          score: ev.evPct * 100 + trueProb * 20,
          marketType: market.marketType,
          propStatType: market.propStatType,
          playerName: market.player?.name ?? null,
          description: market.description,
        });
      });
    }

    // Sort by score, then greedily pick legs that don't massively conflict
    candidates.sort((a, b) => b.score - a.score);

    const selected: ScoredLeg[] = [];
    for (const cand of candidates) {
      if (selected.length >= maxLegs) break;
      // Don't add if contradictory with any selected leg
      const hasContradiction = selected.some((sel) => {
        const r = computeCorrelation(cand.legType, cand.teamId, sel.legType, sel.teamId);
        return r < -0.7;
      });
      if (!hasContradiction) selected.push(cand);
    }

    return {
      event: { id: event.id, home: event.homeTeam.abbreviation, away: event.awayTeam.abbreviation },
      suggested: selected,
    };
  }

  // ─ Standard multi-game parlay EV ──────────────────────────────────────────
  async analyzeParlay(legs: Array<{ marketId: string; outcome: string }>) {
    if (legs.length < 2) throw new Error('Need at least 2 legs');

    const legData = await Promise.all(
      legs.map(async (input) => {
        const market = await this.prisma.market.findUnique({
          where: { id: input.marketId },
          include: {
            event: { include: { homeTeam: true, awayTeam: true } },
            marketOdds: { where: { isOpen: true }, include: { book: true } },
          },
        });
        if (!market) throw new Error(`Market ${input.marketId} not found`);

        const oddsRows = market.marketOdds.filter((o) => o.outcome === input.outcome);
        const best = oddsRows.length ? oddsRows.reduce((a, b) => (a.odds > b.odds ? a : b)) : null;

        const allOdds = market.marketOdds.map((o) => o.odds);
        const noVig = allOdds.length >= 2 ? this.analyticsService.removeVig(allOdds) : null;
        const idx = market.marketOdds.findIndex((o) => o.outcome === input.outcome);
        const trueProb = noVig && idx >= 0 ? noVig[idx] : 0.5;

        const ev = best ? this.analyticsService.calcEV(trueProb, best.odds) : null;

        return {
          marketId: input.marketId,
          outcome: input.outcome,
          event: { id: market.event.id, home: market.event.homeTeam.abbreviation, away: market.event.awayTeam.abbreviation },
          marketType: market.marketType,
          bestOdds: best?.odds ?? null,
          bestBook: best?.book.name ?? null,
          line: best?.line ?? null,
          trueProb,
          ev,
        };
      }),
    );

    const probs   = legData.map((l) => l.trueProb);
    const indepProb = probs.reduce((p, q) => p * q, 1);
    const parlayDecimal = legData
      .filter((l) => l.bestOdds != null)
      .reduce((p, l) => p * americanToDecimal(l.bestOdds!), 1);

    const evPct = indepProb * parlayDecimal - 1;

    return {
      legs: legData,
      parlayOddsDecimal: Math.round(parlayDecimal * 100) / 100,
      parlayOddsAmerican: decimalToAmerican(parlayDecimal),
      trueProb:  Math.round(indepProb * 10000) / 100,
      evPct: Math.round(evPct * 10000) / 100,
    };
  }
}
