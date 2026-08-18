import { MarketType, PropStatType } from '@prisma/client';
import { getNbaMarketMapping } from './nba-market-map';

describe('NBA market mapping', () => {
  it('maps period markets to first-class market types', () => {
    expect(getNbaMarketMapping('spreads_h1')?.marketType).toBe(MarketType.FIRST_HALF_SPREAD);
    expect(getNbaMarketMapping('totals_q1')?.marketType).toBe(MarketType.FIRST_QUARTER_TOTAL);
    expect(getNbaMarketMapping('team_totals')?.marketType).toBe(MarketType.TEAM_TOTAL);
  });

  it('maps Opportunity-First prop categories', () => {
    expect(getNbaMarketMapping('player_turnovers')?.propStatType).toBe(PropStatType.TURNOVERS);
    expect(getNbaMarketMapping('player_blocks_steals')?.propStatType).toBe(PropStatType.STOCKS);
    expect(getNbaMarketMapping('player_double_double')?.propStatType).toBe(PropStatType.DOUBLE_DOUBLE);
    expect(getNbaMarketMapping('player_triple_double')?.propStatType).toBe(PropStatType.TRIPLE_DOUBLE);
  });

  it('distinguishes alternate player props from base props', () => {
    const alternate = getNbaMarketMapping('player_points_alternate');
    expect(alternate?.marketType).toBe(MarketType.PLAYER_PROP_ALTERNATE);
    expect(alternate?.propStatType).toBe(PropStatType.POINTS);
    expect(alternate?.isAlternate).toBe(true);
  });

  it('rejects undocumented/unmapped markets', () => {
    expect(getNbaMarketMapping('made_up_market')).toBeNull();
  });
});
