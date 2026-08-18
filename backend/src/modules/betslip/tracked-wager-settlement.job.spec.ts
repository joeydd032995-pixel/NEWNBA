import {
  BetDirection,
  BetSlipStatus,
  LegSettlementStatus,
  MarketType,
  PropStatType,
  WagerStructure,
} from '@prisma/client';
import { TrackedWagerSettlementJob, statValue } from './tracked-wager-settlement.job';

describe('TrackedWagerSettlementJob', () => {
  let prisma: any;
  let job: TrackedWagerSettlementJob;

  beforeEach(() => {
    prisma = {
      statLine: { findFirst: jest.fn() },
      betSlipItem: { update: jest.fn() },
      betSlip: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    };
    job = new TrackedWagerSettlementJob(prisma);
  });

  it('settles an exact final-event OVER prop from the linked StatLine only', async () => {
    prisma.statLine.findFirst.mockResolvedValue({
      points: 31, rebounds: 8, assists: 6, steals: 1, blocks: 0,
      turnovers: 3, fg3m: 4, minutes: 36,
    });
    const item = {
      direction: BetDirection.OVER,
      recommendedLine: 28.5,
      market: {
        marketType: MarketType.PLAYER_PROP,
        propStatType: PropStatType.POINTS,
        player: { id: 'player-1' },
        event: { id: 'event-1', status: 'FINAL' },
      },
    };

    const result = await (job as any).resolvePlayerPropLeg(item);

    expect(prisma.statLine.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { playerId: 'player-1', eventId: 'event-1' },
    }));
    expect(result).toEqual({ status: LegSettlementStatus.WIN, actualValue: 31 });
  });

  it('settles double-double YES as a binary leg', async () => {
    prisma.statLine.findFirst.mockResolvedValue({
      points: 21, rebounds: 12, assists: 7, steals: 1, blocks: 1,
      turnovers: 2, fg3m: 1, minutes: 34,
    });
    const item = {
      direction: BetDirection.YES,
      recommendedLine: null,
      market: {
        marketType: MarketType.PLAYER_PROP,
        propStatType: PropStatType.DOUBLE_DOUBLE,
        player: { id: 'player-1' },
        event: { id: 'event-1', status: 'FINAL' },
      },
    };

    expect(await (job as any).resolvePlayerPropLeg(item)).toEqual({
      status: LegSettlementStatus.WIN,
      actualValue: 1,
    });
  });

  it('leaves unsupported final markets unresolved instead of guessing', async () => {
    const item = {
      direction: BetDirection.HOME,
      recommendedLine: null,
      market: {
        marketType: MarketType.MONEYLINE,
        propStatType: null,
        player: null,
        event: { id: 'event-1', status: 'FINAL' },
      },
    };
    expect(await (job as any).resolvePlayerPropLeg(item)).toBeNull();
    expect(prisma.statLine.findFirst).not.toHaveBeenCalled();
  });

  it('finalizes an independent single batch from per-leg stakes', async () => {
    prisma.betSlip.findUnique.mockResolvedValue({
      id: 'slip-1',
      status: BetSlipStatus.SUBMITTED,
      structure: WagerStructure.SINGLE_BATCH,
      totalStake: 30,
      items: [
        { settlementStatus: LegSettlementStatus.WIN, stake: 10, odds: 100 },
        { settlementStatus: LegSettlementStatus.LOSS, stake: 10, odds: -110 },
        { settlementStatus: LegSettlementStatus.PUSH, stake: 10, odds: -110 },
      ],
    });
    prisma.betSlip.update.mockResolvedValue({});

    expect(await (job as any).finalizeSlip('slip-1')).toBe(true);
    expect(prisma.betSlip.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'slip-1' },
      data: expect.objectContaining({
        status: BetSlipStatus.SETTLED,
        settlementPayout: 30,
        settlementProfitLoss: 0,
      }),
    }));
  });

  it('finalizes a true parlay using one ticket stake and push reduction', async () => {
    prisma.betSlip.findUnique.mockResolvedValue({
      id: 'parlay-1',
      status: BetSlipStatus.SUBMITTED,
      structure: WagerStructure.PARLAY,
      totalStake: 20,
      ticketStake: 20,
      items: [
        { settlementStatus: LegSettlementStatus.WIN, stake: 0, odds: 100 },
        { settlementStatus: LegSettlementStatus.PUSH, stake: 0, odds: -110 },
      ],
    });
    prisma.betSlip.update.mockResolvedValue({});

    expect(await (job as any).finalizeSlip('parlay-1')).toBe(true);
    expect(prisma.betSlip.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: BetSlipStatus.WON,
        totalOdds: 2,
        settlementPayout: 40,
        settlementProfitLoss: 20,
      }),
    }));
  });
});

describe('statValue', () => {
  const statLine = {
    points: 25, rebounds: 11, assists: 10, steals: 2, blocks: 3,
    turnovers: 4, fg3m: 5, minutes: 38,
  };

  it('supports stocks and combination props', () => {
    expect(statValue(statLine, PropStatType.STOCKS)).toBe(5);
    expect(statValue(statLine, PropStatType.PRA)).toBe(46);
    expect(statValue(statLine, PropStatType.RA)).toBe(21);
  });

  it('supports milestone outcomes', () => {
    expect(statValue(statLine, PropStatType.DOUBLE_DOUBLE)).toBe(1);
    expect(statValue(statLine, PropStatType.TRIPLE_DOUBLE)).toBe(1);
  });
});
