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
    const masked = this.apiKey ? `${this.apiKey.slice(0, 4)}...${this.apiKey.slice(-4)}` : 'NOT SET';
    this.logger.log(`OddsApiService initialized: key=${masked}, baseUrl=${this.baseUrl}`);
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
    try {
      const { data } = await this.http.get<OddsApiEvent[]>(`/sports/${sportKey}/odds`, {
        params: {
          apiKey: this.apiKey,
          regions,
          markets,
          oddsFormat: 'american',
        },
      });
      return data;
    } catch (e) {
      const status = e?.response?.status;
      const body = e?.response?.data;
      if (status === 401) {
        this.logger.error(`Odds API returned 401 (Unauthorized) — ODDS_API_KEY is likely invalid or expired. Response: ${JSON.stringify(body)}`);
      } else if (status === 429) {
        this.logger.warn(`Odds API rate limit hit (429). Remaining requests: ${e?.response?.headers?.['x-requests-remaining'] ?? 'unknown'}`);
      } else {
        this.logger.error(`Odds API request failed [${status ?? 'no status'}]: ${e.message}`, body ? JSON.stringify(body) : '');
      }
      throw e;
    }
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
    markets = 'h2h,spreads,totals',
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
      const status = e?.response?.status;
      if (status === 422) {
        // 422 = event doesn't support these markets (normal for many events)
        this.logger.debug(`Event ${eventId} has no available markets for: ${markets}`);
      } else if (status === 429) {
        this.logger.warn(`Rate limited fetching event odds for ${eventId} — backing off`);
        throw e; // re-throw so caller can stop the loop
      } else {
        this.logger.warn(`Failed to fetch event odds for ${eventId}: ${e.message}`);
      }
      return null;
    }
  }

  private assertEnabled() {
    if (!this.isEnabled) {
      throw new Error('ODDS_API_KEY is not configured');
    }
  }
}
