import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export interface NbaPlayer {
  nba_id: number;
  name: string;
  team_abbreviation: string;
  team_city: string;
  team_name: string;
  is_active: boolean;
  season?: string;
}

export interface NbaGameLog {
  nba_id: number;
  game_id: string;
  game_date: string;
  matchup: string;
  season: string;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  minutes: number;
  fgm: number;
  fga: number;
  fg_pct: number;
  fg3m: number;
  fg3a: number;
  fg3_pct: number;
  ftm: number;
  fta: number;
  ft_pct: number;
  plus_minus: number;
  ts_pct: number;
  efg_pct: number;
  usg_pct: number;
  bpm: number;
}

export interface NbaPlayerSeasonStats {
  nba_id: number;
  name: string;
  team_abbreviation: string;
  gp: number;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  min: number;
  fg_pct: number;
  fg3m: number;
  fg3_pct: number;
  ft_pct: number;
  usg_pct: number;
  ts_pct: number;
  net_rating: number;
  plus_minus: number;
  season?: string;
}

export interface NbaTodayGame {
  game_id: string;
  game_date_est: string;
  game_status_text: string;
  home_team_id: number;
  visitor_team_id: number;
  home_team_abbreviation: string;
  visitor_team_abbreviation: string;
  live_period: number;
  live_pc_time: string;
}

export interface NbaPlayerInfo {
  nba_id: number;
  name: string;
  position: string;
  height: string;
  weight: string;
  jersey_number: string;
  team_abbreviation: string;
  team_city: string;
  team_name: string;
  is_active: boolean;
}

export type NbaTrackingMeasure =
  | 'Rebounding'
  | 'Possessions'
  | 'CatchShoot'
  | 'PullUpShot'
  | 'Defense'
  | 'Drives'
  | 'Passing'
  | 'ElbowTouch'
  | 'PostTouch'
  | 'PaintTouch'
  | 'Efficiency'
  | 'SpeedDistance';

export interface NbaOfficialDataset<T = Record<string, any>> {
  source: 'stats.nba.com';
  source_tier: 'TIER_1_OFFICIAL';
  data_quality: 'LOW' | 'MEDIUM' | 'HIGH';
  season: string;
  rows: T[];
  fetched_at: string;
  measure?: string;
  player_or_team?: string;
  play_type?: string | null;
  team_id?: number;
}

@Injectable()
export class NbaDataService {
  private readonly logger = new Logger(NbaDataService.name);
  private readonly http: AxiosInstance;
  private readonly baseUrl: string;

  constructor(private config: ConfigService) {
    this.baseUrl = this.config.get<string>('NBA_DATA_URL', 'http://nba-data:8000');
    this.http = axios.create({
      baseURL: this.baseUrl,
      timeout: 60_000,
    });
  }

  get isEnabled(): boolean {
    return !!this.config.get<string>('NBA_DATA_URL');
  }

  async checkHealth(): Promise<boolean> {
    try {
      await this.http.get('/health', { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  async getCurrentSeason(): Promise<string> {
    const { data } = await this.http.get<{ season: string }>('/season/current');
    return data.season;
  }

  async getActivePlayers(season?: string): Promise<NbaPlayer[]> {
    const { data } = await this.http.get<NbaPlayer[]>('/players/active', {
      params: season ? { season } : undefined,
    });
    return data;
  }

  async getPlayerGameLogs(
    nbaId: number,
    season?: string,
    lastN = 20,
  ): Promise<NbaGameLog[]> {
    const params: Record<string, any> = { last_n: lastN };
    if (season) params.season = season;
    const { data } = await this.http.get<NbaGameLog[]>(
      `/players/${nbaId}/game-logs`,
      { params },
    );
    return data;
  }

  async getSeasonStats(season?: string): Promise<NbaPlayerSeasonStats[]> {
    const { data } = await this.http.get<NbaPlayerSeasonStats[]>(
      '/players/season-stats',
      { params: season ? { season } : undefined },
    );
    return data;
  }

  async getTodayGames(): Promise<{ games: NbaTodayGame[]; scores: Record<string, any> }> {
    const { data } = await this.http.get('/games/today');
    return data;
  }

  async getPlayerInfo(nbaId: number): Promise<NbaPlayerInfo> {
    const { data } = await this.http.get<NbaPlayerInfo>(`/players/${nbaId}/info`);
    return data;
  }

  async getTrackingMeasure(
    measure: NbaTrackingMeasure,
    options: {
      season?: string;
      playerOrTeam?: 'Player' | 'Team';
      perMode?: 'Totals' | 'PerGame';
      lastNGames?: number;
    } = {},
  ): Promise<NbaOfficialDataset> {
    const { data } = await this.http.get<NbaOfficialDataset>(
      `/tracking/league/${measure}`,
      {
        params: {
          ...(options.season ? { season: options.season } : {}),
          player_or_team: options.playerOrTeam ?? 'Player',
          per_mode: options.perMode ?? 'PerGame',
          last_n_games: options.lastNGames ?? 0,
        },
      },
    );
    return data;
  }

  async getPlayTypes(
    options: {
      season?: string;
      playerOrTeam?: 'P' | 'T';
      playType?: string;
      perMode?: 'Totals' | 'PerGame';
    } = {},
  ): Promise<NbaOfficialDataset> {
    const { data } = await this.http.get<NbaOfficialDataset>('/tracking/play-types', {
      params: {
        ...(options.season ? { season: options.season } : {}),
        player_or_team: options.playerOrTeam ?? 'P',
        ...(options.playType ? { play_type: options.playType } : {}),
        per_mode: options.perMode ?? 'Totals',
      },
    });
    return data;
  }

  async getTeamLineups(
    nbaTeamId: number,
    season?: string,
    lastNGames = 0,
  ): Promise<NbaOfficialDataset> {
    const { data } = await this.http.get<NbaOfficialDataset>(
      `/teams/${nbaTeamId}/lineups`,
      {
        params: {
          ...(season ? { season } : {}),
          last_n_games: lastNGames,
        },
      },
    );
    return data;
  }

  async getTeamOnOff(
    nbaTeamId: number,
    season?: string,
    lastNGames = 0,
  ): Promise<NbaOfficialDataset> {
    const { data } = await this.http.get<NbaOfficialDataset>(
      `/teams/${nbaTeamId}/on-off`,
      {
        params: {
          ...(season ? { season } : {}),
          last_n_games: lastNGames,
        },
      },
    );
    return data;
  }
}
