import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export interface OddsApiSport {
  key: string;
  group: string;
  title: string;
  description: string;
  active: boolean;
  has_outrights: boolean;
}

export interface OddsApiOutcome {
  name: string;
  price: number; // American odds
  point?: number;
}

export interface OddsApiBookmaker {
  key: string;
  title: string;
  last_update: string;
  markets: {
    key: string;
    last_update: string;
    outcomes: OddsApiOutcome[];
  }[];
}

export interface OddsApiEvent {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: OddsApiBookmaker[];
}

@Injectable()
export class OddsApiService {
  private readonly logger = new Logger(OddsApiService.name);
  private readonly http: AxiosInstance;
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;

  constructor(private config: ConfigService) {
    this.apiKey = this.config.get<string>('ODDS_API_KEY');
    this.baseUrl = this.config.get<string>('ODDS_API_BASE_URL', 'https://api.the-odds-api.com/v4');
    this.http = axios.create({ baseURL: this.baseUrl, timeout: 10000 });
  }

  get isEnabled(): boolean {
    return !!this.apiKey;
  }

  async getSports(): Promise<OddsApiSport[]> {
    this.assertEnabled();
    const { data } = await this.http.get<OddsApiSport[]>('/sports', {
      params: { apiKey: this.apiKey },
    });
    return data;
  }

  /**
   * Fetch odds for a given sport.
   * @param sportKey e.g. 'basketball_nba'
   * @param markets comma-separated market keys: 'h2h', 'spreads', 'totals'
   * @param regions comma-separated regions: 'us', 'eu', 'uk', 'au'
   */
  async getOdds(
    sportKey: string,
    markets = 'h2h,spreads,totals',
    regions = 'us',
  ): Promise<OddsApiEvent[]> {
    this.assertEnabled();
    const { data } = await this.http.get<OddsApiEvent[]>(`/sports/${sportKey}/odds`, {
      params: {
        apiKey: this.apiKey,
        regions,
        markets,
        oddsFormat: 'american',
      },
    });
    return data;
  }

  /**
   * List upcoming events for a sport (without odds).
   */
  async getSportEvents(sportKey: string): Promise<Array<{ id: string; home_team: string; away_team: string; commence_time: string }>> {
    this.assertEnabled();
    try {
      const { data } = await this.http.get<Array<{ id: string; home_team: string; away_team: string; commence_time: string }>>(
        `/sports/${sportKey}/events`,
        { params: { apiKey: this.apiKey } },
      );
      return data;
    } catch (e) {
      this.logger.warn(`Failed to fetch events for ${sportKey}: ${e.message}`);
      return [];
    }
  }

  /**
   * Fetch odds for a specific event.
   */
  async getEventOdds(
    sportKey: string,
    eventId: string,
    markets = 'h2h,spreads,totals,player_props',
    regions = 'us',
  ): Promise<OddsApiEvent | null> {
    this.assertEnabled();
    try {
      const { data } = await this.http.get<OddsApiEvent[]>(
        `/sports/${sportKey}/events/${eventId}/odds`,
        { params: { apiKey: this.apiKey, regions, markets, oddsFormat: 'american' } },
      );
      return data[0] ?? null;
    } catch (e) {
      this.logger.warn(`Failed to fetch event odds for ${eventId}: ${e.message}`);
      return null;
    }
  }

  private assertEnabled() {
    if (!this.isEnabled) {
      throw new Error('ODDS_API_KEY is not configured');
    }
  }
}
