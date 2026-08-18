import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export interface OfficialShotZoneMetric {
  attempts: number;
  frequency: number;
  efficiency: number;
}

export interface OfficialPlayerShotProfile {
  player_id: number;
  season: string;
  season_type: string;
  profile: {
    total_attempts: number;
    rim: OfficialShotZoneMetric;
    midrange: OfficialShotZoneMetric;
    corner3: OfficialShotZoneMetric;
    atb3: OfficialShotZoneMetric;
    expected_efg: number | null;
    expected_efg_sample: number;
  };
  source: string;
  source_tier: 'TIER_1_OFFICIAL';
  data_quality: 'LOW' | 'MEDIUM' | 'HIGH';
  fetched_at: string;
}

@Injectable()
export class NbaShotDataService {
  private readonly http: AxiosInstance;

  constructor(private readonly config: ConfigService) {
    this.http = axios.create({
      baseURL: this.config.get<string>('NBA_DATA_URL', 'http://nba-data:8000'),
      timeout: 60_000,
    });
  }

  async getPlayerShotProfile(
    nbaPlayerId: number,
    season: string,
    seasonType = 'Regular Season',
  ): Promise<OfficialPlayerShotProfile> {
    const { data } = await this.http.get<OfficialPlayerShotProfile>(
      `/shots/players/${nbaPlayerId}/profile`,
      { params: { season, season_type: seasonType } },
    );
    return data;
  }
}
