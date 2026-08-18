import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PlayType } from '@prisma/client';
import { PrismaService } from '../../modules/prisma/prisma.service';
import { NbaDataService, NbaOfficialDataset, NbaTrackingMeasure } from '../nba-data/nba-data.service';

const NBA_TEAM_IDS: Record<string, number> = {
  ATL: 1610612737, BOS: 1610612738, CLE: 1610612739, NOP: 1610612740,
  CHI: 1610612741, DAL: 1610612742, DEN: 1610612743, GSW: 1610612744,
  HOU: 1610612745, LAC: 1610612746, LAL: 1610612747, MIA: 1610612748,
  MIL: 1610612749, MIN: 1610612750, BKN: 1610612751, NYK: 1610612752,
  ORL: 1610612753, IND: 1610612754, PHI: 1610612755, PHX: 1610612756,
  POR: 1610612757, SAC: 1610612758, SAS: 1610612759, OKC: 1610612760,
  TOR: 1610612761, UTA: 1610612762, MEM: 1610612763, WAS: 1610612764,
  DET: 1610612765, CHA: 1610612766,
};

const TRACKING_MEASURES: NbaTrackingMeasure[] = [
  'Possessions',
  'Drives',
  'Passing',
  'Rebounding',
  'CatchShoot',
  'PullUpShot',
  'PostTouch',
  'PaintTouch',
];

const PLAY_TYPES: Array<{ provider: string; prisma: PlayType }> = [
  { provider: 'Isolation', prisma: PlayType.ISOLATION },
  { provider: 'Transition', prisma: PlayType.TRANSITION },
  { provider: 'PRBallHandler', prisma: PlayType.PICK_AND_ROLL_BALL_HANDLER },
  { provider: 'PRRollman', prisma: PlayType.PICK_AND_ROLL_ROLL_MAN },
  { provider: 'Postup', prisma: PlayType.POST_UP },
  { provider: 'Handoff', prisma: PlayType.HANDOFF },
  { provider: 'Spotup', prisma: PlayType.SPOT_UP },
  { provider: 'Cut', prisma: PlayType.CUT },
  { provider: 'OffScreen', prisma: PlayType.OFF_SCREEN },
  { provider: 'OffRebound', prisma: PlayType.PUTBACK },
];

/** Official NBA Opportunity-First snapshot ingestion. */
@Injectable()
export class OpportunityDataIngestionJob {
  private readonly logger = new Logger(OpportunityDataIngestionJob.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly nbaData: NbaDataService,
  ) {}

  @Cron('15 */6 * * *')
  async syncOpportunityData(): Promise<void> {
    if (this.running || !this.nbaData.isEnabled) return;
    this.running = true;
    try {
      const season = await this.nbaData.getCurrentSeason();
      await this.syncPlayerTracking(season);
      await this.syncPlayTypes(season);
      await this.syncLineupsAndOnOff(season);
    } catch (error) {
      this.logger.error(`Opportunity data sync failed: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  private async syncPlayerTracking(season: string): Promise<void> {
    const datasets = new Map<NbaTrackingMeasure, NbaOfficialDataset>();
    for (const measure of TRACKING_MEASURES) {
      try {
        datasets.set(measure, await this.nbaData.getTrackingMeasure(measure, {
          season,
          playerOrTeam: 'Player',
          perMode: 'PerGame',
        }));
      } catch (error) {
        this.logger.warn(`Tracking ${measure} unavailable: ${(error as Error).message}`);
      }
    }
    if (!datasets.size) return;

    const players = await this.prisma.player.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });
    const playerByName = new Map(players.map((player) => [normalizeName(player.name), player]));
    const merged = new Map<string, Record<string, any>>();

    for (const [measure, dataset] of datasets.entries()) {
      for (const row of dataset.rows) {
        const playerName = stringField(row, ['player_name', 'player']);
        if (!playerName) continue;
        const key = normalizeName(playerName);
        const existing = merged.get(key) ?? { playerName };
        existing[measure] = row;
        merged.set(key, existing);
      }
    }

    const now = new Date();
    const snapshotDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours()));
    let written = 0;

    for (const [nameKey, bundle] of merged.entries()) {
      const player = playerByName.get(nameKey);
      if (!player) continue;
      const possessions = bundle.Possessions ?? {};
      const passing = bundle.Passing ?? {};
      const rebounding = bundle.Rebounding ?? {};
      const drives = bundle.Drives ?? {};
      const postTouch = bundle.PostTouch ?? {};
      const paintTouch = bundle.PaintTouch ?? {};
      const catchShoot = bundle.CatchShoot ?? {};
      const pullUp = bundle.PullUpShot ?? {};

      const minutes = firstNumber(
        [possessions, passing, rebounding, drives],
        ['min', 'minutes'],
      ) ?? 0;
      const touches = numberField(possessions, ['touches']) ?? 0;
      const drivesValue = numberField(drives, ['drives']) ?? 0;
      const potentialAssists = numberField(passing, ['potential_ast', 'potential_assists']) ?? 0;
      const reboundChances = numberField(rebounding, ['reb_chances', 'rebound_chances']) ?? 0;
      const contestedRate = numberField(rebounding, ['contested_reb_pct', 'contested_rebound_pct']) ?? 0;

      await this.prisma.playerOpportunityStat.upsert({
        where: {
          playerId_gameDate_source: {
            playerId: player.id,
            gameDate: snapshotDate,
            source: 'stats.nba.com_tracking_snapshot',
          },
        },
        create: {
          playerId: player.id,
          season,
          gameDate: snapshotDate,
          minutes,
          touches,
          touchesPerMinute: safeRate(touches, minutes),
          timeOfPossessionSeconds: (numberField(possessions, ['time_of_poss', 'time_of_possession']) ?? 0) * 60,
          drives: drivesValue,
          drivesPerMinute: safeRate(drivesValue, minutes),
          paintTouches: numberField(paintTouch, ['paint_touches', 'touches']) ?? 0,
          postTouches: numberField(postTouch, ['post_touches', 'touches']) ?? 0,
          passesMade: numberField(passing, ['passes_made']) ?? 0,
          potentialAssists,
          potentialAssistsPerMinute: safeRate(potentialAssists, minutes),
          reboundChances,
          reboundChancesPerMinute: safeRate(reboundChances, minutes),
          contestedReboundRate: contestedRate,
          expectedEfg: 0,
          source: 'stats.nba.com_tracking_snapshot',
          sourceTier: 'TIER_1_OFFICIAL',
        },
        update: {
          minutes,
          touches,
          touchesPerMinute: safeRate(touches, minutes),
          timeOfPossessionSeconds: (numberField(possessions, ['time_of_poss', 'time_of_possession']) ?? 0) * 60,
          drives: drivesValue,
          drivesPerMinute: safeRate(drivesValue, minutes),
          paintTouches: numberField(paintTouch, ['paint_touches', 'touches']) ?? 0,
          postTouches: numberField(postTouch, ['post_touches', 'touches']) ?? 0,
          passesMade: numberField(passing, ['passes_made']) ?? 0,
          potentialAssists,
          potentialAssistsPerMinute: safeRate(potentialAssists, minutes),
          reboundChances,
          reboundChancesPerMinute: safeRate(reboundChances, minutes),
          contestedReboundRate: contestedRate,
        },
      });

      await this.prisma.playerShotProfile.create({
        data: {
          playerId: player.id,
          season,
          gameDate: snapshotDate,
          minutes,
          catchShootAttempts: numberField(catchShoot, ['catch_shoot_fga', 'fga']) ?? 0,
          catchShootFrequency: numberField(catchShoot, ['freq', 'frequency']) ?? 0,
          catchShootEfficiency: firstDefinedNumber(catchShoot, ['efg_pct', 'fg_pct', 'catch_shoot_efg_pct']) ?? 0,
          pullupAttempts: numberField(pullUp, ['pull_up_fga', 'fga']) ?? 0,
          pullupFrequency: numberField(pullUp, ['freq', 'frequency']) ?? 0,
          pullupEfficiency: firstDefinedNumber(pullUp, ['efg_pct', 'fg_pct', 'pull_up_efg_pct']) ?? 0,
          expectedEfg: 0,
          source: 'stats.nba.com_tracking_snapshot',
          sourceTier: 'TIER_1_OFFICIAL',
        },
      }).catch(() => null);
      written++;
    }

    this.logger.log(`Official tracking snapshot: ${written} players persisted for ${season}`);
  }

  private async syncPlayTypes(season: string): Promise<void> {
    const players = await this.prisma.player.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });
    const playerByName = new Map(players.map((player) => [normalizeName(player.name), player]));
    const now = new Date();
    let written = 0;

    for (const playType of PLAY_TYPES) {
      let dataset: NbaOfficialDataset;
      try {
        dataset = await this.nbaData.getPlayTypes({
          season,
          playerOrTeam: 'P',
          playType: playType.provider,
          perMode: 'Totals',
        });
      } catch (error) {
        this.logger.warn(`Play type ${playType.provider} unavailable: ${(error as Error).message}`);
        continue;
      }

      for (const row of dataset.rows) {
        const playerName = stringField(row, ['player_name', 'player']);
        const player = playerName ? playerByName.get(normalizeName(playerName)) : undefined;
        if (!player) continue;
        await this.prisma.playerPlayTypeStat.create({
          data: {
            playerId: player.id,
            season,
            gameDate: now,
            playType: playType.prisma,
            possessions: numberField(row, ['poss', 'possessions']) ?? 0,
            frequency: numberField(row, ['poss_pct', 'frequency', 'freq']) ?? 0,
            pointsPerPossession: numberField(row, ['ppp', 'points_per_possession']) ?? 0,
            efgPct: numberField(row, ['efg_pct']) ?? 0,
            turnoverPct: numberField(row, ['tov_pct', 'turnover_pct']) ?? 0,
            freeThrowFrequency: numberField(row, ['ft_poss_pct', 'free_throw_frequency']) ?? 0,
            source: 'stats.nba.com_synergy',
            sourceTier: 'TIER_1_OFFICIAL',
          },
        });
        written++;
      }
    }
    this.logger.log(`Official play-type snapshot: ${written} rows persisted for ${season}`);
  }

  private async syncLineupsAndOnOff(season: string): Promise<void> {
    const teams = await this.prisma.team.findMany({
      where: { sport: { slug: 'nba' }, isActive: true },
      include: { players: { where: { isActive: true }, select: { id: true, name: true } } },
    });

    for (const team of teams) {
      const nbaTeamId = NBA_TEAM_IDS[team.abbreviation];
      if (!nbaTeamId) continue;
      await this.syncTeamLineups(team, nbaTeamId, season).catch((error) =>
        this.logger.warn(`Lineup sync ${team.abbreviation} failed: ${(error as Error).message}`),
      );
      await this.syncTeamOnOff(team, nbaTeamId, season).catch((error) =>
        this.logger.warn(`On/off sync ${team.abbreviation} failed: ${(error as Error).message}`),
      );
    }
  }

  private async syncTeamLineups(team: any, nbaTeamId: number, season: string): Promise<void> {
    const dataset = await this.nbaData.getTeamLineups(nbaTeamId, season, 0);
    const playerByName = new Map<string, { id: string; name: string }>(
      team.players.map((player: { id: string; name: string }) => [normalizeName(player.name), player]),
    );

    for (const row of dataset.rows) {
      const lineupKey = stringField(row, ['group_id', 'lineup_id']);
      if (!lineupKey) continue;
      const lineup = await this.prisma.fiveManLineup.upsert({
        where: { teamId_season_lineupKey: { teamId: team.id, season, lineupKey } },
        create: { teamId: team.id, season, lineupKey },
        update: {},
      });

      const groupName = stringField(row, ['group_name', 'lineup_name']);
      if (groupName) {
        const names = splitLineupNames(groupName);
        for (let index = 0; index < names.length && index < 5; index++) {
          const player = playerByName.get(normalizeName(names[index]));
          if (!player) continue;
          await this.prisma.fiveManLineupPlayer.upsert({
            where: { lineupId_playerId: { lineupId: lineup.id, playerId: player.id } },
            create: { lineupId: lineup.id, playerId: player.id, slot: index + 1 },
            update: { slot: index + 1 },
          }).catch(() => null);
        }
      }

      await this.prisma.fiveManLineupStat.create({
        data: {
          lineupId: lineup.id,
          possessions: numberField(row, ['poss', 'possessions']) ?? 0,
          minutes: numberField(row, ['min', 'minutes']) ?? 0,
          ortg: numberField(row, ['off_rating', 'offensive_rating']) ?? 0,
          drtg: numberField(row, ['def_rating', 'defensive_rating']) ?? 0,
          netRating: numberField(row, ['net_rating']) ?? 0,
          pace: numberField(row, ['pace']) ?? 0,
          source: 'stats.nba.com_team_lineups',
          sourceTier: 'TIER_1_OFFICIAL',
        },
      });
    }
  }

  private async syncTeamOnOff(team: any, nbaTeamId: number, season: string): Promise<void> {
    const dataset = await this.nbaData.getTeamOnOff(nbaTeamId, season, 0);
    const playerByName = new Map<string, { id: string; name: string }>(
      team.players.map((player: { id: string; name: string }) => [normalizeName(player.name), player]),
    );
    const paired = new Map<string, { on?: any; off?: any; player: { id: string; name: string } }>();

    for (const row of dataset.rows) {
      const playerName = stringField(row, ['vs_player_name', 'player_name', 'player']);
      const player = playerName ? playerByName.get(normalizeName(playerName)) : undefined;
      if (!player) continue;
      const key = player.id;
      const entry = paired.get(key) ?? { player };
      const resultSet = String(row._result_set ?? '').toLowerCase();
      const courtStatus = String(row.court_status ?? '').toLowerCase();
      if (resultSet.includes('off') || courtStatus.includes('off')) entry.off = row;
      else entry.on = row;
      paired.set(key, entry);
    }

    for (const entry of paired.values()) {
      const on = entry.on ?? {};
      const off = entry.off ?? {};
      await this.prisma.playerOnOffStat.create({
        data: {
          playerId: entry.player.id,
          teamId: team.id,
          season,
          minutesOn: numberField(on, ['min', 'minutes']) ?? 0,
          minutesOff: numberField(off, ['min', 'minutes']) ?? 0,
          ortgOn: numberField(on, ['off_rating', 'offensive_rating']) ?? 0,
          ortgOff: numberField(off, ['off_rating', 'offensive_rating']) ?? 0,
          drtgOn: numberField(on, ['def_rating', 'defensive_rating']) ?? 0,
          drtgOff: numberField(off, ['def_rating', 'defensive_rating']) ?? 0,
          netRatingOn: numberField(on, ['net_rating']) ?? 0,
          netRatingOff: numberField(off, ['net_rating']) ?? 0,
          paceOn: numberField(on, ['pace']) ?? 0,
          paceOff: numberField(off, ['pace']) ?? 0,
          source: 'stats.nba.com_on_off',
          sourceTier: 'TIER_1_OFFICIAL',
        },
      });
    }
  }
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function stringField(row: Record<string, any>, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return '';
}

function numberField(row: Record<string, any>, keys: string[]): number | null {
  for (const key of keys) {
    const raw = row[key];
    if (raw === undefined || raw === null || raw === '') continue;
    const value = Number(raw);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function firstDefinedNumber(row: Record<string, any>, keys: string[]): number | null {
  return numberField(row, keys);
}

function firstNumber(rows: Record<string, any>[], keys: string[]): number | null {
  for (const row of rows) {
    const value = numberField(row, keys);
    if (value !== null) return value;
  }
  return null;
}

function safeRate(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function splitLineupNames(value: string): string[] {
  return value
    .split(/\s+-\s+|\s*\|\s*|\s*,\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
}
