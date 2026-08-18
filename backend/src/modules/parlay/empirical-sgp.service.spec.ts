import { PropStatType } from '@prisma/client';
import { EmpiricalSgpService } from './empirical-sgp.service';
import type { ProjectionDistribution } from '../projection/projection.types';

function distribution(stat: any, offset = 0): ProjectionDistribution {
  const samples = Array.from({ length: 100 }, (_, index) => 18 + offset + (index % 20) * 0.6);
  return {
    stat,
    trials: samples.length,
    seed: 42 + offset,
    mean: samples.reduce((sum, value) => sum + value, 0) / samples.length,
    median: 24 + offset,
    stdDev: 3,
    percentiles: { p05: 19, p10: 20, p25: 22, p50: 24, p75: 27, p90: 29, p95: 30 },
    samples,
    uncertainty: { minutes: 1, opportunity: 1, conversion: 1, context: 1, pace: 1, total: 5 },
    pointEstimate: 24 + offset,
    opportunityEquation: {
      expectedMinutes: 34,
      opportunityRatePerMinute: 0.8,
      opportunityRateSource: 'PER_MINUTE',
      conversionRate: 0.9,
      contextAdjustment: 1,
      paceAdjustment: 1,
      pppAdjustment: 1,
    },
  };
}

function playerMarket(id: string, playerId: string, teamId: string, statType = PropStatType.POINTS) {
  return {
    id,
    eventId: 'event-1',
    marketType: 'PLAYER_PROP',
    propStatType: statType,
    player: { id: playerId, name: playerId, teamId, team: { abbreviation: teamId } },
    marketOdds: [
      { id: `${id}-over`, outcome: 'over', odds: -105, line: 24.5, bookId: 'book-1', book: { id: 'book-1', name: 'Book', slug: 'book' } },
      { id: `${id}-under`, outcome: 'under', odds: -115, line: 24.5, bookId: 'book-1', book: { id: 'book-1', name: 'Book', slug: 'book' } },
    ],
  };
}

function history(playerOffset: number, teamId: string, count = 8) {
  return Array.from({ length: count }, (_, index) => {
    const start = new Date(Date.UTC(2026, 0, index + 1, 1));
    return {
      points: 20 + playerOffset + index * 2,
      rebounds: 5 + index * 0.2,
      assists: 4 + index * 0.3,
      steals: 1,
      blocks: 1,
      turnovers: 2,
      fg3m: 2,
      minutes: 34,
      gameDate: start,
      event: {
        id: `hist-${index}`,
        startTime: start,
        homeTeamId: teamId === 'team-home' ? 'team-home' : 'opponent-home',
        awayTeamId: teamId === 'team-away' ? 'team-away' : 'opponent-away',
      },
    };
  });
}

describe('EmpiricalSgpService', () => {
  let prisma: any;
  let analytics: any;
  let assembler: any;
  let service: EmpiricalSgpService;

  beforeEach(() => {
    prisma = {
      event: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'event-1',
          startTime: new Date('2026-02-01T01:00:00Z'),
          homeTeam: { abbreviation: 'HOM' },
          awayTeam: { abbreviation: 'AWY' },
        }),
      },
      market: { findUnique: jest.fn() },
      statLine: { findMany: jest.fn() },
    };
    analytics = {
      removeVig: jest.fn().mockReturnValue([0.52, 0.48]),
      calcEV: jest.fn((probability: number) => ({
        ev: probability - 0.5,
        evPct: probability - 0.5,
        kellyFraction: 0.01,
        impliedProb: 0.5,
        isPositiveEV: probability > 0.5,
      })),
    };
    assembler = { assemble: jest.fn() };
    service = new EmpiricalSgpService(prisma, analytics, assembler);
  });

  it('withholds correlation adjustment for mixed player and non-player legs', async () => {
    prisma.market.findUnique
      .mockResolvedValueOnce(playerMarket('p-market', 'p1', 'team-home'))
      .mockResolvedValueOnce({
        id: 'ml-market',
        eventId: 'event-1',
        marketType: 'MONEYLINE',
        propStatType: null,
        player: null,
        marketOdds: [
          { id: 'ml-home', outcome: 'home', odds: -110, line: null, bookId: 'book-1', book: { id: 'book-1', name: 'Book', slug: 'book' } },
          { id: 'ml-away', outcome: 'away', odds: -110, line: null, bookId: 'book-1', book: { id: 'book-1', name: 'Book', slug: 'book' } },
        ],
      });
    assembler.assemble.mockResolvedValue({ distribution: distribution('POINTS'), dataQuality: 'HIGH' });

    const result = await service.analyze('event-1', [
      { marketId: 'p-market', outcome: 'over' },
      { marketId: 'ml-market', outcome: 'home' },
    ]);

    expect(result.correlationModel.status).toBe('UNMODELED');
    expect(result.correlationModel.reason).toBe('MIXED_OR_UNMODELED_LEG');
    expect(result.corrProb).toBeNull();
    expect(result.corrEVPct).toBeNull();
    expect(result.warning).toContain('No heuristic correlation');
  });

  it('withholds adjustment when trustworthy aligned history is insufficient', async () => {
    prisma.market.findUnique
      .mockResolvedValueOnce(playerMarket('m1', 'p1', 'team-home'))
      .mockResolvedValueOnce(playerMarket('m2', 'p2', 'team-away'));
    assembler.assemble
      .mockResolvedValueOnce({ distribution: distribution('POINTS'), dataQuality: 'HIGH' })
      .mockResolvedValueOnce({ distribution: distribution('POINTS', 2), dataQuality: 'HIGH' });
    prisma.statLine.findMany
      .mockResolvedValueOnce(history(0, 'team-home', 4))
      .mockResolvedValueOnce(history(2, 'team-away', 4));

    const result = await service.analyze('event-1', [
      { marketId: 'm1', outcome: 'over' },
      { marketId: 'm2', outcome: 'over' },
    ]);

    expect(result.correlationModel.status).toBe('UNMODELED');
    expect(result.correlationModel.sampleSize).toBe(4);
    expect(result.corrProb).toBeNull();
  });

  it('uses an empirical aligned-history matrix and Gaussian copula when coverage is trustworthy', async () => {
    prisma.market.findUnique
      .mockResolvedValueOnce(playerMarket('m1', 'p1', 'team-home'))
      .mockResolvedValueOnce(playerMarket('m2', 'p2', 'team-away'));
    assembler.assemble
      .mockResolvedValueOnce({ distribution: distribution('POINTS'), dataQuality: 'HIGH' })
      .mockResolvedValueOnce({ distribution: distribution('POINTS', 2), dataQuality: 'HIGH' });
    prisma.statLine.findMany
      .mockResolvedValueOnce(history(0, 'team-home', 10))
      .mockResolvedValueOnce(history(3, 'team-away', 10));

    const result = await service.analyze('event-1', [
      { marketId: 'm1', outcome: 'over' },
      { marketId: 'm2', outcome: 'over' },
    ]);

    expect(result.correlationModel.status).toBe('MODELED');
    expect(result.correlationModel.sampleSize).toBe(10);
    expect(result.correlationModel.method).toBe('EMPIRICAL_ALIGNED_HISTORY_GAUSSIAN_COPULA');
    expect(result.correlationModel.matrix).toHaveLength(2);
    expect(result.corrProb).not.toBeNull();
    expect(result.corrEVPct).not.toBeNull();
  });
});
