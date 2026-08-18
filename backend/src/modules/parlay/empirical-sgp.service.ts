import { Injectable } from '@nestjs/common';
import { PropStatType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { PlayerPropProjectionAssembler } from '../player-props/player-prop-projection.assembler';
import { correlatedJointProbability, empiricalCorrelationMatrix } from '../projection/correlation.engine';
import { probabilityOver, probabilityUnder } from '../projection/opportunity-projection.engine';
import { ProjectionDistribution } from '../projection/projection.types';
import { SGPLegInputDto } from './dto/parlay.dto';

const MIN_EMPIRICAL_SAMPLES = 8;
const MAX_HISTORY_ROWS = 60;

type CanonicalDirection = 'OVER' | 'UNDER';

type ModeledLeg = {
  marketId: string;
  outcome: string;
  marketType: string;
  propStatType: PropStatType | null;
  playerId: string | null;
  playerName: string | null;
  teamId: string | null;
  bestOdds: number;
  bestBook: string;
  bookId: string;
  line: number | null;
  probability: number;
  probabilitySource: 'OPPORTUNITY_FIRST' | 'MARKET_NO_VIG_BASELINE';
  ev: ReturnType<AnalyticsService['calcEV']>;
  distribution: ProjectionDistribution | null;
  correlationLine: number | null;
  correlationDirection: CanonicalDirection | null;
  dataQuality: string | null;
};

@Injectable()
export class EmpiricalSgpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
    private readonly assembler: PlayerPropProjectionAssembler,
  ) {}

  async analyze(eventId: string, legInputs: SGPLegInputDto[]) {
    if (legInputs.length < 2) throw new Error('SGP requires at least 2 legs');

    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: { homeTeam: true, awayTeam: true },
    });
    if (!event) throw new Error('Event not found');

    const legs = await Promise.all(legInputs.map((input) => this.resolveLeg(eventId, input)));
    const indepProb = legs.reduce((product, leg) => product * leg.probability, 1);
    const parlayDecimal = legs.reduce((product, leg) => product * americanToDecimal(leg.bestOdds), 1);
    const indepEv = indepProb * parlayDecimal - 1;

    const correlation = await this.buildCorrelationModel(legs);
    let corrProb: number | null = null;
    let corrEv: number | null = null;

    if (correlation.status === 'MODELED' && correlation.matrix) {
      const distributions = legs.map((leg) => leg.distribution!);
      const lines = legs.map((leg) => leg.correlationLine!);
      const directions = legs.map((leg) => leg.correlationDirection!);
      corrProb = correlatedJointProbability(
        distributions,
        lines,
        directions,
        correlation.matrix,
        stableSeed(eventId, legInputs),
        25_000,
      );
      corrEv = corrProb * parlayDecimal - 1;
    }

    const pairs = correlation.matrix
      ? buildPairSummaries(correlation.matrix)
      : [];

    return {
      event: {
        id: event.id,
        home: event.homeTeam.abbreviation,
        away: event.awayTeam.abbreviation,
        startTime: event.startTime,
      },
      legs: legs.map(({ distribution, correlationLine, correlationDirection, ...leg }) => ({
        ...leg,
        projection: distribution ? {
          mean: distribution.mean,
          median: distribution.median,
          stdDev: distribution.stdDev,
          percentiles: distribution.percentiles,
        } : null,
      })),
      correlationModel: {
        status: correlation.status,
        method: correlation.status === 'MODELED' ? 'EMPIRICAL_ALIGNED_HISTORY_GAUSSIAN_COPULA' : 'UNMODELED',
        sampleSize: correlation.sampleSize,
        reason: correlation.reason,
        matrix: correlation.matrix,
        pairs,
      },
      parlayOddsDecimal: round2(parlayDecimal),
      parlayOddsAmerican: decimalToAmerican(parlayDecimal),
      indepProb: roundPct(indepProb),
      corrProb: corrProb === null ? null : roundPct(corrProb),
      indepEVPct: roundPct(indepEv),
      corrEVPct: corrEv === null ? null : roundPct(corrEv),
      evImprovementPct: corrEv === null ? null : roundPct(corrEv - indepEv),
      warning: correlation.status === 'MODELED'
        ? null
        : 'Correlation-adjusted EV is withheld because the selected legs do not have enough trustworthy aligned historical observations. No heuristic correlation was substituted.',
    };
  }

  async suggest(eventId: string, maxLegs = 5) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: {
        homeTeam: true,
        awayTeam: true,
        markets: {
          where: { isActive: true, marketType: { in: ['PLAYER_PROP', 'PLAYER_PROP_ALTERNATE'] } },
          include: {
            player: { include: { team: true } },
            marketOdds: { where: { isOpen: true }, include: { book: true } },
          },
        },
      },
    });
    if (!event) return null;

    const candidates: ModeledLeg[] = [];
    for (const market of event.markets) {
      if (!market.player || !market.propStatType) continue;
      const grouped = new Map<string, typeof market.marketOdds[number]>();
      for (const row of market.marketOdds) {
        const outcome = normalizeOutcome(row.outcome);
        if (!['over', 'under', 'yes', 'no'].includes(outcome)) continue;
        const key = `${outcome}:${row.line ?? 'binary'}`;
        const existing = grouped.get(key);
        if (!existing || row.odds > existing.odds) grouped.set(key, row);
      }

      for (const row of grouped.values()) {
        const leg = await this.resolveLeg(eventId, { marketId: market.id, outcome: row.outcome });
        if (!leg.distribution || !leg.ev.isPositiveEV) continue;
        candidates.push(leg);
      }
    }

    candidates.sort((a, b) => b.ev.evPct - a.ev.evPct || b.probability - a.probability);
    const selected: ModeledLeg[] = [];
    for (const candidate of candidates) {
      if (selected.length >= Math.max(2, Math.min(8, maxLegs))) break;
      if (selected.some((leg) => leg.marketId === candidate.marketId && leg.outcome !== candidate.outcome)) continue;
      if (selected.some((leg) => leg.marketId === candidate.marketId && leg.outcome === candidate.outcome && leg.line === candidate.line)) continue;
      selected.push(candidate);
    }

    const correlation = selected.length >= 2
      ? await this.buildCorrelationModel(selected)
      : { status: 'UNMODELED' as const, sampleSize: 0, reason: 'NOT_ENOUGH_POSITIVE_EV_PLAYER_PROP_LEGS', matrix: null };

    return {
      event: { id: event.id, home: event.homeTeam.abbreviation, away: event.awayTeam.abbreviation },
      suggested: selected.map(({ distribution, correlationLine, correlationDirection, ...leg }) => ({
        ...leg,
        projectionMedian: distribution?.median ?? null,
      })),
      correlationModel: correlation,
      note: correlation.status === 'MODELED'
        ? 'Suggestions are positive-EV Opportunity-First player props with empirically modeled correlation coverage.'
        : 'Suggestions are positive-EV Opportunity-First player props, but correlation optimization is withheld because aligned trustworthy history is insufficient.',
    };
  }

  private async resolveLeg(eventId: string, input: SGPLegInputDto): Promise<ModeledLeg> {
    const market = await this.prisma.market.findUnique({
      where: { id: input.marketId },
      include: {
        player: { include: { team: true } },
        marketOdds: { where: { isOpen: true }, include: { book: true } },
      },
    });
    if (!market || market.eventId !== eventId) throw new Error(`Market ${input.marketId} is not active for event ${eventId}`);

    const outcome = normalizeOutcome(input.outcome);
    const oddsRows = market.marketOdds.filter((row) => normalizeOutcome(row.outcome) === outcome);
    if (!oddsRows.length) throw new Error(`No open odds for outcome ${input.outcome}`);
    const best = oddsRows.reduce((a, b) => a.odds > b.odds ? a : b);

    const isPlayerProp = ['PLAYER_PROP', 'PLAYER_PROP_ALTERNATE'].includes(market.marketType) && !!market.player && !!market.propStatType;
    if (isPlayerProp) {
      const assembly = await this.assembler.assemble({
        playerId: market.player!.id,
        eventId,
        statType: market.propStatType!,
        mode: 'STANDARD',
      });
      if (assembly) {
        const binary = market.propStatType === PropStatType.DOUBLE_DOUBLE || market.propStatType === PropStatType.TRIPLE_DOUBLE;
        const line = binary ? 0.5 : best.line;
        const direction: CanonicalDirection | null = binary
          ? outcome === 'yes' ? 'OVER' : outcome === 'no' ? 'UNDER' : null
          : outcome === 'over' ? 'OVER' : outcome === 'under' ? 'UNDER' : null;
        if (line !== null && direction) {
          const probability = binary
            ? direction === 'OVER' ? assembly.distribution.mean : 1 - assembly.distribution.mean
            : direction === 'OVER'
              ? probabilityOver(assembly.distribution, line)
              : probabilityUnder(assembly.distribution, line);
          return {
            marketId: market.id,
            outcome,
            marketType: market.marketType,
            propStatType: market.propStatType,
            playerId: market.player!.id,
            playerName: market.player!.name,
            teamId: market.player!.teamId,
            bestOdds: best.odds,
            bestBook: best.book.name,
            bookId: best.bookId,
            line: best.line,
            probability,
            probabilitySource: 'OPPORTUNITY_FIRST',
            ev: this.analytics.calcEV(probability, best.odds),
            distribution: assembly.distribution,
            correlationLine: line,
            correlationDirection: direction,
            dataQuality: assembly.dataQuality,
          };
        }
      }
    }

    const noVig = this.marketNoVigProbability(market.marketOdds, best.id);
    return {
      marketId: market.id,
      outcome,
      marketType: market.marketType,
      propStatType: market.propStatType,
      playerId: market.player?.id ?? null,
      playerName: market.player?.name ?? null,
      teamId: market.player?.teamId ?? null,
      bestOdds: best.odds,
      bestBook: best.book.name,
      bookId: best.bookId,
      line: best.line,
      probability: noVig,
      probabilitySource: 'MARKET_NO_VIG_BASELINE',
      ev: this.analytics.calcEV(noVig, best.odds),
      distribution: null,
      correlationLine: null,
      correlationDirection: null,
      dataQuality: null,
    };
  }

  private marketNoVigProbability(rows: Array<{ id: string; odds: number }>, selectedId: string): number {
    if (rows.length < 2) return 0.5;
    const probabilities = this.analytics.removeVig(rows.map((row) => row.odds));
    const index = rows.findIndex((row) => row.id === selectedId);
    return index >= 0 ? probabilities[index] : 0.5;
  }

  private async buildCorrelationModel(legs: ModeledLeg[]): Promise<{
    status: 'MODELED' | 'UNMODELED';
    sampleSize: number;
    reason: string | null;
    matrix: number[][] | null;
  }> {
    if (legs.some((leg) => !leg.distribution || !leg.playerId || !leg.propStatType || !leg.teamId)) {
      return { status: 'UNMODELED', sampleSize: 0, reason: 'MIXED_OR_UNMODELED_LEG', matrix: null };
    }

    const histories = await Promise.all(legs.map((leg) => this.loadTrustedHistory(leg)));
    if (histories.some((history) => history.size < MIN_EMPIRICAL_SAMPLES)) {
      return { status: 'UNMODELED', sampleSize: Math.min(...histories.map((history) => history.size)), reason: 'INSUFFICIENT_TRUSTED_HISTORY', matrix: null };
    }

    const commonKeys = [...histories[0].keys()].filter((key) => histories.every((history) => history.has(key)));
    if (commonKeys.length < MIN_EMPIRICAL_SAMPLES) {
      return { status: 'UNMODELED', sampleSize: commonKeys.length, reason: 'INSUFFICIENT_ALIGNED_HISTORY', matrix: null };
    }

    const series = histories.map((history) => commonKeys.map((key) => history.get(key)!));
    try {
      const matrix = empiricalCorrelationMatrix(series);
      return { status: 'MODELED', sampleSize: commonKeys.length, reason: null, matrix };
    } catch {
      return { status: 'UNMODELED', sampleSize: commonKeys.length, reason: 'EMPIRICAL_MATRIX_INVALID', matrix: null };
    }
  }

  private async loadTrustedHistory(leg: ModeledLeg): Promise<Map<string, number>> {
    const rows = await this.prisma.statLine.findMany({
      where: { playerId: leg.playerId! },
      orderBy: { gameDate: 'desc' },
      take: MAX_HISTORY_ROWS,
      include: {
        event: { select: { id: true, startTime: true, homeTeamId: true, awayTeamId: true } },
      },
    });

    const trusted = new Map<string, number>();
    for (const row of rows) {
      if (!row.event) continue;
      const dateDeltaHours = Math.abs(row.event.startTime.getTime() - row.gameDate.getTime()) / 3_600_000;
      if (dateDeltaHours > 30) continue;
      if (row.event.homeTeamId !== leg.teamId && row.event.awayTeamId !== leg.teamId) continue;
      trusted.set(row.event.id, statValue(row, leg.propStatType!));
    }
    return trusted;
  }
}

function statValue(row: any, statType: PropStatType): number {
  switch (statType) {
    case PropStatType.POINTS: return row.points;
    case PropStatType.REBOUNDS: return row.rebounds;
    case PropStatType.ASSISTS: return row.assists;
    case PropStatType.STEALS: return row.steals;
    case PropStatType.BLOCKS: return row.blocks;
    case PropStatType.THREES: return row.fg3m;
    case PropStatType.TURNOVERS: return row.turnovers;
    case PropStatType.STOCKS: return row.steals + row.blocks;
    case PropStatType.MINUTES: return row.minutes;
    case PropStatType.PRA: return row.points + row.rebounds + row.assists;
    case PropStatType.PR: return row.points + row.rebounds;
    case PropStatType.PA: return row.points + row.assists;
    case PropStatType.RA: return row.rebounds + row.assists;
    case PropStatType.DOUBLE_DOUBLE:
      return [row.points, row.rebounds, row.assists, row.steals, row.blocks].filter((value) => value >= 10).length >= 2 ? 1 : 0;
    case PropStatType.TRIPLE_DOUBLE:
      return [row.points, row.rebounds, row.assists, row.steals, row.blocks].filter((value) => value >= 10).length >= 3 ? 1 : 0;
    default: return 0;
  }
}

function normalizeOutcome(value: string): string {
  return value.trim().toLowerCase();
}

function americanToDecimal(odds: number): number {
  return odds > 0 ? odds / 100 + 1 : 100 / Math.abs(odds) + 1;
}

function decimalToAmerican(decimal: number): number {
  return decimal >= 2 ? Math.round((decimal - 1) * 100) : Math.round(-100 / (decimal - 1));
}

function stableSeed(eventId: string, legs: SGPLegInputDto[]): number {
  const text = `${eventId}|${legs.map((leg) => `${leg.marketId}:${normalizeOutcome(leg.outcome)}`).sort().join('|')}`;
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function buildPairSummaries(matrix: number[][]) {
  const pairs: Array<{ legA: number; legB: number; correlation: number; label: string }> = [];
  for (let i = 0; i < matrix.length; i++) {
    for (let j = i + 1; j < matrix.length; j++) {
      const r = matrix[i][j];
      pairs.push({ legA: i, legB: j, correlation: Math.round(r * 1000) / 1000, label: correlationLabel(r) });
    }
  }
  return pairs;
}

function correlationLabel(r: number): string {
  const abs = Math.abs(r);
  const strength = abs >= 0.6 ? 'STRONG' : abs >= 0.3 ? 'MODERATE' : abs >= 0.1 ? 'SLIGHT' : 'NEGLIGIBLE';
  return `${strength}_${r >= 0 ? 'POSITIVE' : 'NEGATIVE'}`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundPct(value: number): number {
  return Math.round(value * 10_000) / 100;
}
