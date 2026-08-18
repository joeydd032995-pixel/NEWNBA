import { MarketType, PropStatType } from '@prisma/client';

export interface NbaMarketMapping {
  marketType: MarketType;
  propStatType?: PropStatType;
  isPlayerMarket: boolean;
  isAlternate: boolean;
}

/**
 * The Odds API NBA market keys normalized into NEWNBA first-class semantics.
 * Unknown keys are deliberately ignored rather than coerced into a generic bet.
 */
export const NBA_MARKET_MAP: Record<string, NbaMarketMapping> = {
  h2h: { marketType: MarketType.MONEYLINE, isPlayerMarket: false, isAlternate: false },
  spreads: { marketType: MarketType.SPREAD, isPlayerMarket: false, isAlternate: false },
  totals: { marketType: MarketType.TOTAL, isPlayerMarket: false, isAlternate: false },
  team_totals: { marketType: MarketType.TEAM_TOTAL, isPlayerMarket: false, isAlternate: false },

  h2h_h1: { marketType: MarketType.FIRST_HALF_MONEYLINE, isPlayerMarket: false, isAlternate: false },
  spreads_h1: { marketType: MarketType.FIRST_HALF_SPREAD, isPlayerMarket: false, isAlternate: false },
  totals_h1: { marketType: MarketType.FIRST_HALF_TOTAL, isPlayerMarket: false, isAlternate: false },
  team_totals_h1: { marketType: MarketType.FIRST_HALF_TEAM_TOTAL, isPlayerMarket: false, isAlternate: false },

  h2h_q1: { marketType: MarketType.FIRST_QUARTER_MONEYLINE, isPlayerMarket: false, isAlternate: false },
  spreads_q1: { marketType: MarketType.FIRST_QUARTER_SPREAD, isPlayerMarket: false, isAlternate: false },
  totals_q1: { marketType: MarketType.FIRST_QUARTER_TOTAL, isPlayerMarket: false, isAlternate: false },
  team_totals_q1: { marketType: MarketType.FIRST_QUARTER_TEAM_TOTAL, isPlayerMarket: false, isAlternate: false },

  player_points: player(PropStatType.POINTS),
  player_rebounds: player(PropStatType.REBOUNDS),
  player_assists: player(PropStatType.ASSISTS),
  player_threes: player(PropStatType.THREES),
  player_blocks: player(PropStatType.BLOCKS),
  player_steals: player(PropStatType.STEALS),
  player_turnovers: player(PropStatType.TURNOVERS),
  player_blocks_steals: player(PropStatType.STOCKS),
  player_points_rebounds_assists: player(PropStatType.PRA),
  player_points_rebounds: player(PropStatType.PR),
  player_points_assists: player(PropStatType.PA),
  player_rebounds_assists: player(PropStatType.RA),
  player_double_double: player(PropStatType.DOUBLE_DOUBLE),
  player_triple_double: player(PropStatType.TRIPLE_DOUBLE),

  player_points_alternate: player(PropStatType.POINTS, true),
  player_rebounds_alternate: player(PropStatType.REBOUNDS, true),
  player_assists_alternate: player(PropStatType.ASSISTS, true),
  player_threes_alternate: player(PropStatType.THREES, true),
  player_blocks_alternate: player(PropStatType.BLOCKS, true),
  player_steals_alternate: player(PropStatType.STEALS, true),
  player_turnovers_alternate: player(PropStatType.TURNOVERS, true),
  player_points_rebounds_assists_alternate: player(PropStatType.PRA, true),
  player_points_rebounds_alternate: player(PropStatType.PR, true),
  player_points_assists_alternate: player(PropStatType.PA, true),
  player_rebounds_assists_alternate: player(PropStatType.RA, true),

  alternate_spreads: derivative(),
  alternate_totals: derivative(),
  alternate_team_totals: derivative(),
};

export const NBA_ADDITIONAL_MARKET_KEYS = Object.keys(NBA_MARKET_MAP)
  .filter((key) => !['h2h', 'spreads', 'totals'].includes(key))
  .join(',');

function player(propStatType: PropStatType, alternate = false): NbaMarketMapping {
  return {
    marketType: alternate ? MarketType.PLAYER_PROP_ALTERNATE : MarketType.PLAYER_PROP,
    propStatType,
    isPlayerMarket: true,
    isAlternate: alternate,
  };
}

function derivative(): NbaMarketMapping {
  return {
    marketType: MarketType.DERIVATIVE,
    isPlayerMarket: false,
    isAlternate: true,
  };
}

export function getNbaMarketMapping(key: string): NbaMarketMapping | null {
  return NBA_MARKET_MAP[key] ?? null;
}
