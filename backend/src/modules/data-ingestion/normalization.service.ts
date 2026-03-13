import { Injectable } from '@nestjs/common';

const BOOK_SLUG_MAP: Record<string, string> = {
  draftkings: 'DraftKings',
  fanduel: 'FanDuel',
  betmgm: 'BetMGM',
  caesars: 'Caesars',
  pointsbet: 'PointsBet',
  barstool: 'Barstool',
  bet365: 'Bet365',
  betrivers: 'BetRivers',
  unibet: 'Unibet',
  bovada: 'Bovada',
  mybookieag: 'MyBookie',
  betonlineag: 'BetOnline',
  lowvig: 'LowVig',
  pinnacle: 'Pinnacle',
  williamhill_us: 'William Hill',
  wynnbet: 'WynnBet',
  superbook: 'SuperBook',
  twinspires: 'TwinSpires',
  betfred: 'BetFred',
  foxbet: 'FOX Bet',
};

const MARKET_KEY_MAP: Record<string, string> = {
  h2h: 'MONEYLINE',
  spreads: 'SPREAD',
  totals: 'TOTAL',
  player_points: 'POINTS',
  player_rebounds: 'REBOUNDS',
  player_assists: 'ASSISTS',
  player_threes: 'THREES',
  player_blocks: 'BLOCKS',
  player_steals: 'STEALS',
};

const ESPN_INJURY_STATUS_MAP: Record<string, string> = {
  Out: 'OUT',
  'Day-To-Day': 'GTD',
  'Game Time Decision': 'GTD',
  Questionable: 'QUESTIONABLE',
  Doubtful: 'DOUBTFUL',
  Probable: 'PROBABLE',
  Active: 'ACTIVE',
};

@Injectable()
export class NormalizationService {
  normalizeBookSlug(raw: string): string {
    return raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  bookSlugToName(slug: string): string {
    return BOOK_SLUG_MAP[slug] ?? slug;
  }

  normalizeMarketKey(key: string): string | null {
    return MARKET_KEY_MAP[key] ?? null;
  }

  normalizeInjuryStatus(raw: string): string {
    return ESPN_INJURY_STATUS_MAP[raw] ?? 'QUESTIONABLE';
  }

  /** Convert American odds to implied probability */
  americanToImplied(americanOdds: number): number {
    if (americanOdds > 0) return 100 / (americanOdds + 100);
    return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
  }

  /** Detect if an odds change is significant (>= threshold in implied prob %) */
  isSignificantMove(oldOdds: number, newOdds: number, thresholdPct = 3): boolean {
    const oldImpl = this.americanToImplied(oldOdds);
    const newImpl = this.americanToImplied(newOdds);
    return Math.abs(newImpl - oldImpl) * 100 >= thresholdPct;
  }
}
