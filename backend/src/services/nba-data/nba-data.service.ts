import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

// ─── Response shapes from the Python sidecar ─────────────────────────────────

export interface NbaPlayer {
  nba_id: number;
  name: string;
  team_abbreviation: string;
  team_city: string;
  team_name: string;
  is_active: boolean;
}

export interface NbaGameLog {
  nba_id: number;
  game_id: string;
  game_date: string; // 'YYYY-MM-DD'
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

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class NbaDataService {
  private readonly logger = new Logger(NbaDataService.name);
  private readonly http: AxiosInstance;
  private readonly baseUrl: string;

  constructor(private config: ConfigService) {
    this.baseUrl = this.config.get<string>('NBA_DATA_URL', 'http://nba-data:8000');
    this.http = axios.create({
      baseURL: this.baseUrl,
      timeout: 60_000, // nba_api can be slow; give it 60s
    });
  }

  /** True when the sidecar URL is configured */
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

  async getActivePlayers(): Promise<NbaPlayer[]> {
    const { data } = await this.http.get<NbaPlayer[]>('/players/active');
    return data;
  }

  async getPlayerGameLogs(
    nbaId: number,
    season = '2024-25',
    lastN = 20,
  ): Promise<NbaGameLog[]> {
    const { data } = await this.http.get<NbaGameLog[]>(
      `/players/${nbaId}/game-logs`,
      { params: { season, last_n: lastN } },
    );
    return data;
  }

  async getSeasonStats(season = '2024-25'): Promise<NbaPlayerSeasonStats[]> {
    const { data } = await this.http.get<NbaPlayerSeasonStats[]>(
      '/players/season-stats',
      { params: { season } },
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
}
