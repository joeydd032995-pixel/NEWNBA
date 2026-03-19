import { PlayerPropsService } from './player-props.service';
import { PropStatType } from '@prisma/client';

describe('PlayerPropsService', () => {
  let service: PlayerPropsService;
  let prismaStub: any;
  let analyticsStub: any;

  beforeEach(() => {
    prismaStub = {
      statLine: { findMany: jest.fn().mockResolvedValue([]) },
      player:   { findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
      market:   { findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
      team:     { findMany: jest.fn().mockResolvedValue([]) },
      event:    { findMany: jest.fn().mockResolvedValue([]) },
      injuryReport: { findFirst: jest.fn().mockResolvedValue(null) },
      newsItem:     { findMany: jest.fn().mockResolvedValue([]) },
    } as any;

    analyticsStub = {
      calcEV: jest.fn().mockReturnValue({ ev: 0.05, evPct: 5, kellyFraction: 0.02 }),
    } as any;

    service = new PlayerPropsService(prismaStub, analyticsStub);
  });

  // ─── computeStatValue ────────────────────────────────────────────────────

  describe('computeStatValue', () => {
    const sl = {
      points: 25, rebounds: 8, assists: 6, steals: 2, blocks: 1,
      fg3m: 3, minutes: 34,
    };

    it('returns points for POINTS', () => {
      expect(service.computeStatValue(sl, PropStatType.POINTS)).toBe(25);
    });

    it('returns rebounds for REBOUNDS', () => {
      expect(service.computeStatValue(sl, PropStatType.REBOUNDS)).toBe(8);
    });

    it('returns assists for ASSISTS', () => {
      expect(service.computeStatValue(sl, PropStatType.ASSISTS)).toBe(6);
    });

    it('returns steals for STEALS', () => {
      expect(service.computeStatValue(sl, PropStatType.STEALS)).toBe(2);
    });

    it('returns blocks for BLOCKS', () => {
      expect(service.computeStatValue(sl, PropStatType.BLOCKS)).toBe(1);
    });

    it('returns fg3m for THREES', () => {
      expect(service.computeStatValue(sl, PropStatType.THREES)).toBe(3);
    });

    it('returns minutes for MINUTES', () => {
      expect(service.computeStatValue(sl, PropStatType.MINUTES)).toBe(34);
    });

    it('sums pts+reb+ast for PRA', () => {
      expect(service.computeStatValue(sl, PropStatType.PRA)).toBe(39);
    });

    it('sums pts+reb for PR', () => {
      expect(service.computeStatValue(sl, PropStatType.PR)).toBe(33);
    });

    it('sums pts+ast for PA', () => {
      expect(service.computeStatValue(sl, PropStatType.PA)).toBe(31);
    });

    it('sums reb+ast for RA', () => {
      expect(service.computeStatValue(sl, PropStatType.RA)).toBe(14);
    });

    it('returns 0 for unknown stat type', () => {
      expect(service.computeStatValue(sl, 'UNKNOWN' as any)).toBe(0);
    });
  });

  // ─── getHitRate ──────────────────────────────────────────────────────────

  describe('getHitRate', () => {
    it('returns default rate of 0.5 when no stat lines exist', async () => {
      prismaStub.statLine.findMany.mockResolvedValue([]);
      const result = await service.getHitRate('p1', PropStatType.POINTS, 20, 10);
      expect(result).toEqual({ hits: 0, total: 0, rate: 0.5 });
    });

    it('calculates over hit rate correctly', async () => {
      const statLines = [
        { points: 25, rebounds: 0, assists: 0, steals: 0, blocks: 0, fg3m: 0, minutes: 0 },
        { points: 18, rebounds: 0, assists: 0, steals: 0, blocks: 0, fg3m: 0, minutes: 0 },
        { points: 22, rebounds: 0, assists: 0, steals: 0, blocks: 0, fg3m: 0, minutes: 0 },
        { points: 15, rebounds: 0, assists: 0, steals: 0, blocks: 0, fg3m: 0, minutes: 0 },
      ];
      prismaStub.statLine.findMany.mockResolvedValue(statLines);
      // line = 20 → hits at 25 and 22 → 2/4 = 0.5
      const result = await service.getHitRate('p1', PropStatType.POINTS, 20, 4, 'over');
      expect(result.hits).toBe(2);
      expect(result.total).toBe(4);
      expect(result.rate).toBeCloseTo(0.5);
    });

    it('calculates under hit rate correctly', async () => {
      const statLines = [
        { points: 25, rebounds: 0, assists: 0, steals: 0, blocks: 0, fg3m: 0, minutes: 0 },
        { points: 18, rebounds: 0, assists: 0, steals: 0, blocks: 0, fg3m: 0, minutes: 0 },
        { points: 22, rebounds: 0, assists: 0, steals: 0, blocks: 0, fg3m: 0, minutes: 0 },
        { points: 15, rebounds: 0, assists: 0, steals: 0, blocks: 0, fg3m: 0, minutes: 0 },
      ];
      prismaStub.statLine.findMany.mockResolvedValue(statLines);
      // line = 20 → under hits at 18 and 15 → 2/4 = 0.5
      const result = await service.getHitRate('p1', PropStatType.POINTS, 20, 4, 'under');
      expect(result.hits).toBe(2);
      expect(result.total).toBe(4);
      expect(result.rate).toBeCloseTo(0.5);
    });

    it('returns rate of 1.0 when all games hit', async () => {
      const statLines = Array(5).fill({
        points: 30, rebounds: 0, assists: 0, steals: 0, blocks: 0, fg3m: 0, minutes: 0,
      });
      prismaStub.statLine.findMany.mockResolvedValue(statLines);
      const result = await service.getHitRate('p1', PropStatType.POINTS, 20, 5, 'over');
      expect(result.rate).toBe(1);
    });
  });

  // ─── getPlayersWithProps ─────────────────────────────────────────────────

  describe('getPlayersWithProps', () => {
    it('returns players with active prop markets', async () => {
      const players = [
        { id: 'p1', name: 'LeBron James', team: { abbreviation: 'LAL' } },
        { id: 'p2', name: 'Stephen Curry', team: { abbreviation: 'GSW' } },
      ];
      prismaStub.player.findMany.mockResolvedValue(players);
      const result = await service.getPlayersWithProps();
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('LeBron James');
    });

    it('returns empty array when no players have active props', async () => {
      prismaStub.player.findMany.mockResolvedValue([]);
      const result = await service.getPlayersWithProps();
      expect(result).toEqual([]);
    });
  });

  // ─── getCheatSheet ───────────────────────────────────────────────────────

  describe('getCheatSheet', () => {
    it('returns null when player does not exist', async () => {
      prismaStub.player.findUnique.mockResolvedValue(null);
      const result = await service.getCheatSheet('nonexistent', PropStatType.POINTS, 20);
      expect(result).toBeNull();
    });

    it('returns cheat sheet with splits when player and stat lines exist', async () => {
      const homeTeam = { id: 'team1', abbreviation: 'LAL' };
      const awayTeam = { id: 'team2', abbreviation: 'BOS' };
      prismaStub.player.findUnique.mockResolvedValue({
        id: 'p1', name: 'LeBron James', position: 'F', teamId: 'team1',
        team: homeTeam,
      });
      // Minimal stat lines — player is home team, opponent is away team
      prismaStub.statLine.findMany.mockResolvedValue([
        {
          points: 28, rebounds: 0, assists: 0, steals: 0, blocks: 0, fg3m: 0, minutes: 35,
          gameDate: new Date('2024-11-10'),
          event: {
            homeTeamId: 'team1', awayTeamId: 'team2',
            homeTeam, awayTeam,
          },
        },
        {
          points: 15, rebounds: 0, assists: 0, steals: 0, blocks: 0, fg3m: 0, minutes: 30,
          gameDate: new Date('2024-11-08'),
          event: {
            homeTeamId: 'team1', awayTeamId: 'team2',
            homeTeam, awayTeam,
          },
        },
      ]);
      // teams for defense tiers
      prismaStub.team.findMany.mockResolvedValue([homeTeam, awayTeam]);

      const result = await service.getCheatSheet('p1', PropStatType.POINTS, 20);
      expect(result).not.toBeNull();
      expect(result!.player.name).toBe('LeBron James');
      expect(result!.trend).toHaveLength(2);
      expect(result!.splits).toHaveProperty('home');
      expect(result!.splits).toHaveProperty('away');
      expect(result!.seasonAvg).toBeGreaterThan(0);
    });
  });

  // ─── getAnalyzerData ─────────────────────────────────────────────────────

  describe('getAnalyzerData', () => {
    it('returns null when market does not exist', async () => {
      prismaStub.market.findUnique.mockResolvedValue(null);
      const result = await service.getAnalyzerData('nonexistent');
      expect(result).toBeNull();
    });

    it('returns null when market has no player', async () => {
      prismaStub.market.findUnique.mockResolvedValue({
        id: 'm1', player: null, propStatType: null, event: {}, marketOdds: [],
      });
      const result = await service.getAnalyzerData('m1');
      expect(result).toBeNull();
    });

    it('returns analyzer data with defRank and hit rates when market is valid', async () => {
      prismaStub.market.findUnique.mockResolvedValue({
        id: 'm1',
        propStatType: PropStatType.POINTS,
        player: { id: 'p1', name: 'LeBron', teamId: 'team1', team: { abbreviation: 'LAL' } },
        event: { id: 'e1', homeTeamId: 'team1', awayTeamId: 'team2', homeTeam: {}, awayTeam: {} },
        marketOdds: [{ line: 25.5, isOpen: true }],
      });
      // Season stat lines
      prismaStub.statLine.findMany.mockResolvedValue([
        { points: 30, rebounds: 5, assists: 5, steals: 1, blocks: 1, fg3m: 2, minutes: 36 },
        { points: 20, rebounds: 5, assists: 5, steals: 1, blocks: 1, fg3m: 2, minutes: 36 },
      ]);
      // H2H events and H2H stats
      prismaStub.event.findMany.mockResolvedValue([{ id: 'e1' }]);
      // Teams for defensive ranking
      prismaStub.team.findMany.mockResolvedValue([
        { id: 'team1' }, { id: 'team2' },
      ]);

      const result = await service.getAnalyzerData('m1');
      expect(result).not.toBeNull();
      expect(result).toHaveProperty('defRank');
      expect(result).toHaveProperty('seasonHitRate');
      expect(result).toHaveProperty('h2hHitRate');
      expect(result!.defRankTotal).toBeGreaterThan(0);
    });
  });
});
