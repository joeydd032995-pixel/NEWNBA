import { BetDirection } from '@prisma/client';
import {
  deriveHistoricalMinuteBand,
  inferTrackedDirection,
  resolveTrackedOddsRow,
  WagerProjectionSnapshotService,
} from './wager-projection-snapshot.service';

const book = { id: 'book-1', name: 'Test Book' };
const oddsRow = (id: string, outcome: string, odds: number, line: number | null, bookId = 'book-1') => ({
  id,
  bookId,
  outcome,
  odds,
  line,
  book: { id: bookId, name: bookId === 'book-1' ? 'Test Book' : 'Other Book' },
});

describe('WagerProjectionSnapshotService helpers', () => {
  it('resolves one exact sportsbook selection', () => {
    const rows = [
      oddsRow('o1', 'over', -110, 25.5),
      oddsRow('o2', 'under', -110, 25.5),
      oddsRow('o3', 'over', -110, 25.5, 'book-2'),
    ];
    const resolved = resolveTrackedOddsRow(rows, {
      bookId: 'book-1',
      outcome: 'Player OVER 25.5 POINTS',
      direction: 'OVER',
      odds: -110,
      line: 25.5,
    });
    expect(resolved?.id).toBe('o1');
  });

  it('refuses to infer a sportsbook when multiple books are equally valid', () => {
    const rows = [
      oddsRow('o1', 'over', -110, 25.5, 'book-1'),
      oddsRow('o2', 'over', -110, 25.5, 'book-2'),
    ];
    expect(resolveTrackedOddsRow(rows, {
      outcome: 'over', odds: -110, line: 25.5, direction: 'OVER',
    })).toBeNull();
  });

  it('reconstructs the same recent-minutes band used by fallback projection logic', () => {
    const band = deriveHistoricalMinuteBand([28, 30, 32, 34, 36, 38, 40]);
    expect(band.floor).toBeGreaterThanOrEqual(28);
    expect(band.median).toBe(34);
    expect(band.ceiling).toBeGreaterThan(34);
    expect(band.stdDev).toBeGreaterThan(0);
  });

  it('infers only canonical tracked directions', () => {
    expect(inferTrackedDirection('Player OVER 25.5 POINTS')).toBe(BetDirection.OVER);
    expect(inferTrackedDirection('under')).toBe(BetDirection.UNDER);
    expect(inferTrackedDirection('custom outcome')).toBe(BetDirection.OTHER);
  });
});

describe('WagerProjectionSnapshotService capture', () => {
  it('persists the recommendation-time distribution and paired market decision', async () => {
    const samples = Array.from({ length: 1000 }, (_, index) => 20 + index / 100);
    const distribution: any = {
      stat: 'POINTS',
      trials: 1000,
      seed: 42,
      mean: 24.995,
      median: 25,
      stdDev: 2.9,
      percentiles: { p05: 20.5, p10: 21, p25: 22.5, p50: 25, p75: 27.5, p90: 29, p95: 29.5 },
      samples,
      uncertainty: { minutes: 1.5, opportunity: 0.03, conversion: 0.04, context: 0.02, pace: 0.01, total: 1.501 },
      pointEstimate: 25,
      opportunityEquation: {
        expectedMinutes: 35,
        opportunityRatePerMinute: 0.65,
        opportunityRateSource: 'PER_MINUTE',
        conversionRate: 1.08,
        contextAdjustment: 1,
        paceAdjustment: 1.01,
        pppAdjustment: 1,
      },
    };

    const prisma: any = {
      betSlipItem: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'item-1',
          outcome: 'over',
          odds: -110,
          bookId: 'book-1',
          recommendedLine: 24.5,
          direction: 'OVER',
          propStatType: 'POINTS',
          decisionClass: null,
          confidenceBucket: null,
          projectionSnapshot: null,
          market: {
            id: 'market-1',
            eventId: 'event-1',
            marketType: 'PLAYER_PROP',
            propStatType: 'POINTS',
            player: { id: 'player-1' },
            event: { id: 'event-1' },
            marketOdds: [
              oddsRow('over', 'over', -110, 24.5),
              oddsRow('under', 'under', -110, 24.5),
            ],
          },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      playerAvailabilityProjection: {
        findUnique: jest.fn().mockResolvedValue({ expectedAvailabilityProb: 0.99 }),
      },
      rotationProjection: {
        findUnique: jest.fn().mockResolvedValue({
          minutesFloor: 32,
          minutesMedian: 35,
          minutesCeiling: 38,
          minutesStdDev: 1.5,
        }),
      },
      statLine: { findMany: jest.fn().mockResolvedValue([]) },
      wagerProjectionSnapshot: {
        create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'snapshot-1', ...data })),
      },
    };
    const assembler: any = {
      assemble: jest.fn().mockResolvedValue({
        distribution,
        dataQuality: 'HIGH',
        qualityReasons: [],
        inputs: { rotationAvailable: true },
      }),
    };
    const service = new WagerProjectionSnapshotService(prisma, assembler);

    const result = await service.captureForItem('item-1');

    expect(result?.betSlipItemId).toBe('item-1');
    expect(result?.modelVersion).toBe('opportunity-first-v1');
    expect(result?.minutesMedian).toBe(35);
    expect(result?.marketLine).toBe(24.5);
    expect(result?.modelProbability).toBeGreaterThan(0.5);
    expect(prisma.wagerProjectionSnapshot.create).toHaveBeenCalledTimes(1);
    expect(prisma.betSlipItem.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'item-1' },
      data: expect.objectContaining({ direction: 'OVER', propStatType: 'POINTS' }),
    }));
  });
});
