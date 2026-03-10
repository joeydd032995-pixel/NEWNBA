import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

// ─── BallDontLie v1 response shapes ──────────────────────────────────────────

export interface BdlTeam {
  id: number;
  abbreviation: string;
  city: string;
  conference: string;
  division: string;
  full_name: string;
  name: string;
}

export interface BdlPlayer {
  id: number;
  first_name: string;
  last_name: string;
  position: string;
  height_feet: number | null;
  height_inches: number | null;
  weight_pounds: number | null;
  team: BdlTeam;
}

export interface BdlGame {
  id: number;
  date: string; // ISO date string "2024-01-15T00:00:00.000Z"
  season: number;
  status: string;
  home_team: BdlTeam;
  visitor_team: BdlTeam;
  home_team_score: number;
  visitor_team_score: number;
}

export interface BdlStat {
  id: number;
  player: BdlPlayer;
  game: BdlGame;
  team: BdlTeam;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  turnover: number;
  min: string; // "MM:SS" or ""
  fgm: number;
  fga: number;
  fg_pct: number;
  fg3m: number;
  fg3a: number;
  fg3_pct: number;
  ftm: number;
  fta: number;
  ft_pct: number;
  oreb: number;
  dreb: number;
  pf: number;
}

export interface BdlSeasonAverage {
  player_id: number;
  season: number;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  turnover: number;
  min: string;
  fgm: number;
  fga: number;
  fg_pct: number;
  fg3m: number;
  fg3a: number;
  fg3_pct: number;
  ftm: number;
  fta: number;
  ft_pct: number;
}

export interface BdlPaginatedResponse<T> {
  data: T[];
  meta: {
    total_count: number;
    next_cursor?: number;
    per_page: number;
  };
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class BallDontLieService {
  private readonly logger = new Logger(BallDontLieService.name);
  private readonly http: AxiosInstance;
  private readonly apiKey: string | undefined;

  constructor(private config: ConfigService) {
    this.apiKey = this.config.get<string>('BALLDONTLIE_API_KEY');
    const baseURL = this.config.get<string>(
      'BALLDONTLIE_BASE_URL',
      'https://api.balldontlie.io/v1',
    );
    this.http = axios.create({
      baseURL,
      timeout: 15_000,
      headers: this.apiKey ? { Authorization: this.apiKey } : {},
    });
  }

  get isEnabled(): boolean {
    return !!this.apiKey;
  }

  /** Search for players by name. Returns best matches. */
  async searchPlayers(name: string): Promise<BdlPlayer[]> {
    this.assertEnabled();
    const { data } = await this.http.get<BdlPaginatedResponse<BdlPlayer>>('/players', {
      params: { search: name, per_page: 5 },
    });
    return data.data;
  }

  /** Fetch one page of player game stats for a given season. */
  async getPlayerStats(
    playerIds: number[],
    season: number,
    cursor?: number,
    perPage = 100,
  ): Promise<BdlPaginatedResponse<BdlStat>> {
    this.assertEnabled();
    const params: Record<string, any> = {
      per_page: perPage,
      seasons: [season],
    };
    // BDL uses array query params as player_ids[]=
    playerIds.forEach((id, i) => { params[`player_ids[${i}]`] = id; });
    if (cursor) params.cursor = cursor;

    const { data } = await this.http.get<BdlPaginatedResponse<BdlStat>>('/stats', { params });
    return data;
  }

  /** Fetch ALL game stats for the given players/season, auto-paginating. */
  async getAllPlayerStatsForSeason(
    playerIds: number[],
    season: number,
  ): Promise<BdlStat[]> {
    this.assertEnabled();
    const all: BdlStat[] = [];
    let cursor: number | undefined;

    do {
      const page = await this.getPlayerStats(playerIds, season, cursor);
      all.push(...page.data);
      cursor = page.meta.next_cursor;
    } while (cursor);

    return all;
  }

  /** Season averages for a list of player IDs. */
  async getSeasonAverages(
    playerIds: number[],
    season: number,
  ): Promise<BdlSeasonAverage[]> {
    this.assertEnabled();
    const params: Record<string, any> = { season };
    playerIds.forEach((id, i) => { params[`player_ids[${i}]`] = id; });
    const { data } = await this.http.get<{ data: BdlSeasonAverage[] }>(
      '/season_averages',
      { params },
    );
    return data.data;
  }

  private assertEnabled() {
    if (!this.isEnabled) throw new Error('BALLDONTLIE_API_KEY is not configured');
  }
}
