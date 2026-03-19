import { DataIngestionService } from './data-ingestion.service';

describe('DataIngestionService', () => {
  let service: DataIngestionService;
  let prismaStub: any;
  let injuryIngestStub: any;
  let newsIngestStub: any;
  let publicBettingStub: any;

  beforeEach(() => {
    prismaStub = {
      marketOdds: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      oddsSnapshot: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      oddsHistory: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    injuryIngestStub = { syncInjuries: jest.fn().mockResolvedValue(5) };
    newsIngestStub = { syncNews: jest.fn().mockResolvedValue(10) };
    publicBettingStub = { syncPublicBetting: jest.fn().mockResolvedValue(15) };

    service = new DataIngestionService(
      prismaStub,
      injuryIngestStub,
      newsIngestStub,
      publicBettingStub,
    );
  });

  describe('runFullIngestion', () => {
    it('calls all three ingest services', async () => {
      await service.runFullIngestion();

      expect(injuryIngestStub.syncInjuries).toHaveBeenCalledTimes(1);
      expect(newsIngestStub.syncNews).toHaveBeenCalledTimes(1);
      expect(publicBettingStub.syncPublicBetting).toHaveBeenCalledTimes(1);
    });

    it('handles partial failures gracefully via Promise.allSettled', async () => {
      injuryIngestStub.syncInjuries.mockRejectedValue(new Error('API down'));
      newsIngestStub.syncNews.mockResolvedValue(10);

      // Should not throw even if one service fails
      await expect(service.runFullIngestion()).resolves.not.toThrow();
      expect(newsIngestStub.syncNews).toHaveBeenCalled();
    });
  });

  describe('snapshotOdds', () => {
    it('buckets snapshots into 15-minute intervals', async () => {
      const openOdds = [
        {
          id: 'odds-1',
          marketId: 'market-1',
          odds: -110,
          line: null,
          outcome: 'home',
          isOpen: true,
          book: { slug: 'draftkings' },
        },
      ];
      prismaStub.marketOdds.findMany.mockResolvedValue(openOdds);

      await service.snapshotOdds();

      const upsertCall = prismaStub.oddsSnapshot.upsert.mock.calls[0][0];
      const snappedAt: Date = upsertCall.where.marketOddsId_snappedAt.snappedAt;

      // Verify the snappedAt is a 15-minute bucket (seconds = 0, minutes divisible by 15)
      expect(snappedAt.getSeconds()).toBe(0);
      expect(snappedAt.getMilliseconds()).toBe(0);
      expect(snappedAt.getMinutes() % 15).toBe(0);
    });

    it('upserts by composite key (marketOddsId, snappedAt) preventing duplicates', async () => {
      const openOdds = [
        {
          id: 'odds-1',
          odds: -110,
          line: null,
          outcome: 'home',
          book: { slug: 'draftkings' },
        },
      ];
      prismaStub.marketOdds.findMany.mockResolvedValue(openOdds);

      await service.snapshotOdds();

      expect(prismaStub.oddsSnapshot.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            marketOddsId_snappedAt: expect.objectContaining({
              marketOddsId: 'odds-1',
            }),
          },
        }),
      );
    });

    it('returns count of snapped odds', async () => {
      const openOdds = [
        { id: 'odds-1', odds: -110, line: null, outcome: 'home', book: { slug: 'dk' } },
        { id: 'odds-2', odds: -115, line: null, outcome: 'away', book: { slug: 'fd' } },
      ];
      prismaStub.marketOdds.findMany.mockResolvedValue(openOdds);

      const result = await service.snapshotOdds();

      expect(result).toBe(2);
    });
  });

  describe('detectLineMovements', () => {
    it('returns empty array when no recent odds history', async () => {
      prismaStub.oddsHistory.findMany.mockResolvedValue([]);

      const result = await service.detectLineMovements(3);

      expect(result).toEqual([]);
    });

    it('filters moves below threshold (default 3%)', async () => {
      // -110 → -112: tiny move (< 3% implied prob change)
      const history = [
        {
          marketOddsId: 'odds-1',
          odds: -110,
          recordedAt: new Date(),
          marketOdds: {
            id: 'odds-1',
            odds: -112, // tiny move
            outcome: 'home',
            book: { slug: 'dk' },
          },
        },
      ];
      prismaStub.oddsHistory.findMany.mockResolvedValue(history);

      const result = await service.detectLineMovements(3);

      expect(result).toEqual([]);
    });

    it('detects significant line movements above threshold', async () => {
      // -110 → +105: large move
      const history = [
        {
          marketOddsId: 'odds-1',
          odds: -110,
          recordedAt: new Date(),
          marketOdds: {
            id: 'odds-1',
            odds: 105, // significant move
            outcome: 'home',
            book: { slug: 'dk' },
          },
        },
      ];
      prismaStub.oddsHistory.findMany.mockResolvedValue(history);

      const result = await service.detectLineMovements(3);

      expect(result).toHaveLength(1);
      expect(result[0].marketOddsId).toBe('odds-1');
      expect(result[0].movePct).toBeGreaterThanOrEqual(3);
    });
  });

  describe('getInjuryEVMultiplier', () => {
    it('returns 0 for OUT status', () => {
      expect(service.getInjuryEVMultiplier('OUT')).toBe(0);
    });

    it('returns 0.4 for DOUBTFUL status', () => {
      expect(service.getInjuryEVMultiplier('DOUBTFUL')).toBe(0.4);
    });

    it('returns 1.0 for ACTIVE status', () => {
      expect(service.getInjuryEVMultiplier('ACTIVE')).toBe(1.0);
    });

    it('returns 1.0 for unknown statuses (fallback)', () => {
      expect(service.getInjuryEVMultiplier('UNKNOWN_STATUS')).toBe(1.0);
    });
  });
});
