import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BetSlipStatus, WagerStructure } from '@prisma/client';
import { BetslipService } from './betslip.service';

describe('BetslipService', () => {
  let service: BetslipService;
  let prismaStub: any;
  let snapshotStub: any;

  beforeEach(() => {
    prismaStub = {
      betSlip: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      betSlipItem: {
        create: jest.fn(),
        delete: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      market: { findMany: jest.fn().mockResolvedValue([]) },
      book: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(),
    };
    snapshotStub = { captureForItem: jest.fn().mockResolvedValue(null) };
    service = new BetslipService(prismaStub, snapshotStub);
  });

  describe('findAll', () => {
    it('filters and sorts betslips by user with tracking details', async () => {
      const userId = 'user-123';
      const slips = [{ id: 'slip-1', userId, status: 'OPEN' }];
      prismaStub.betSlip.findMany.mockResolvedValue(slips);

      expect(await service.findAll(userId)).toEqual(slips);
      expect(prismaStub.betSlip.findMany).toHaveBeenCalledWith({
        where: { userId },
        include: {
          items: {
            include: {
              book: true,
              postBetReview: true,
              projectionSnapshot: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('addItem', () => {
    it('rejects modifications after submission', async () => {
      prismaStub.betSlip.findUnique.mockResolvedValue({
        id: 'slip-1', userId: 'user-1', status: BetSlipStatus.SUBMITTED, items: [],
      });
      await expect(service.addItem('slip-1', 'user-1', { outcome: 'over', odds: -110 }))
        .rejects.toThrow(BadRequestException);
    });

    it('captures a recommendation snapshot and recalculates an independent single batch', async () => {
      const slip = {
        id: 'slip-1', userId: 'user-1', status: BetSlipStatus.OPEN,
        structure: WagerStructure.SINGLE_BATCH, items: [],
      };
      const item = { id: 'item-1', betSlipId: 'slip-1', stake: 50, odds: -110 };
      prismaStub.betSlip.findUnique
        .mockResolvedValueOnce(slip)
        .mockResolvedValueOnce({ structure: WagerStructure.SINGLE_BATCH, ticketStake: null });
      prismaStub.betSlipItem.create.mockResolvedValue(item);
      prismaStub.betSlipItem.findMany.mockResolvedValue([item]);
      prismaStub.betSlipItem.findUnique.mockResolvedValue(item);
      prismaStub.betSlip.update.mockResolvedValue({});

      await service.addItem('slip-1', 'user-1', { outcome: 'over', odds: -110, stake: 50 });

      expect(snapshotStub.captureForItem).toHaveBeenCalledWith('item-1');
      expect(prismaStub.betSlip.update).toHaveBeenCalledWith({
        where: { id: 'slip-1' },
        data: { totalStake: 50, totalOdds: null, ticketStake: null },
      });
    });

    it('keeps item stake zero and compounds odds for a PARLAY container', async () => {
      const slip = {
        id: 'parlay-1', userId: 'user-1', status: BetSlipStatus.OPEN,
        structure: WagerStructure.PARLAY, ticketStake: 20, items: [],
      };
      const created = { id: 'item-1', betSlipId: 'parlay-1', stake: 0, odds: 100 };
      prismaStub.betSlip.findUnique
        .mockResolvedValueOnce(slip)
        .mockResolvedValueOnce({ structure: WagerStructure.PARLAY, ticketStake: 20 });
      prismaStub.betSlipItem.create.mockResolvedValue(created);
      prismaStub.betSlipItem.findUnique.mockResolvedValue(created);
      prismaStub.betSlipItem.findMany.mockResolvedValue([
        created,
        { id: 'item-2', betSlipId: 'parlay-1', stake: 0, odds: -110 },
      ]);
      prismaStub.betSlip.update.mockResolvedValue({});

      await service.addItem('parlay-1', 'user-1', { outcome: 'over', odds: 100, stake: 99 });

      expect(prismaStub.betSlipItem.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ stake: 0 }),
      }));
      expect(prismaStub.betSlip.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ totalStake: 20, totalOdds: expect.any(Number) }),
      }));
    });

    it('throws when slip does not exist', async () => {
      prismaStub.betSlip.findUnique.mockResolvedValue(null);
      await expect(service.addItem('missing', 'user-1', { outcome: 'home', odds: -110 }))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('createAndSubmitTracked', () => {
    it('persists independent wagers with per-leg stake and no compounded totalOdds', async () => {
      const dto = {
        name: 'singles',
        items: [
          { marketId: 'm1', eventId: 'e1', bookId: 'b1', outcome: 'over', odds: -110, stake: 10 },
          { marketId: 'm2', eventId: 'e2', bookId: 'b1', outcome: 'under', odds: 120, stake: 15 },
        ],
      };
      prismaStub.market.findMany.mockResolvedValue([
        { id: 'm1', eventId: 'e1', isActive: true },
        { id: 'm2', eventId: 'e2', isActive: true },
      ]);
      prismaStub.book.findMany.mockResolvedValue([{ id: 'b1' }]);
      const tx = {
        betSlip: {
          create: jest.fn().mockResolvedValue({ id: 'slip-1' }),
          update: jest.fn().mockResolvedValue({}),
        },
        betSlipItem: {
          create: jest.fn()
            .mockResolvedValueOnce({ id: 'i1' })
            .mockResolvedValueOnce({ id: 'i2' }),
        },
      };
      prismaStub.$transaction.mockImplementation(async (fn: any) => fn(tx));
      prismaStub.betSlip.findUnique.mockResolvedValue({
        id: 'slip-1', userId: 'user-1', items: [], structure: WagerStructure.SINGLE_BATCH,
      });

      await service.createAndSubmitTracked('user-1', dto);

      expect(tx.betSlip.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          structure: WagerStructure.SINGLE_BATCH,
          totalStake: 25,
          totalOdds: null,
          ticketStake: null,
        }),
      });
      expect(tx.betSlipItem.create.mock.calls[0][0].data.stake).toBe(10);
      expect(tx.betSlipItem.create.mock.calls[1][0].data.stake).toBe(15);
      expect(snapshotStub.captureForItem).toHaveBeenCalledTimes(2);
    });
  });

  describe('createAndSubmitParlay', () => {
    it('persists one ticket stake, compounded odds and zero leg stakes', async () => {
      const dto = {
        name: 'sgp', ticketStake: 20,
        items: [
          { marketId: 'm1', eventId: 'e1', bookId: 'b1', outcome: 'over', odds: 100 },
          { marketId: 'm2', eventId: 'e1', bookId: 'b1', outcome: 'under', odds: -110 },
        ],
      };
      prismaStub.market.findMany.mockResolvedValue([
        { id: 'm1', eventId: 'e1', isActive: true },
        { id: 'm2', eventId: 'e1', isActive: true },
      ]);
      prismaStub.book.findMany.mockResolvedValue([{ id: 'b1' }]);
      const tx = {
        betSlip: {
          create: jest.fn().mockResolvedValue({ id: 'parlay-1' }),
          update: jest.fn().mockResolvedValue({}),
        },
        betSlipItem: {
          create: jest.fn()
            .mockResolvedValueOnce({ id: 'i1' })
            .mockResolvedValueOnce({ id: 'i2' }),
        },
      };
      prismaStub.$transaction.mockImplementation(async (fn: any) => fn(tx));
      prismaStub.betSlip.findUnique.mockResolvedValue({
        id: 'parlay-1', userId: 'user-1', items: [], structure: WagerStructure.PARLAY,
      });

      await service.createAndSubmitParlay('user-1', dto);

      expect(tx.betSlip.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          structure: WagerStructure.PARLAY,
          totalStake: 20,
          ticketStake: 20,
          totalOdds: expect.any(Number),
        }),
      });
      expect(tx.betSlipItem.create.mock.calls.every((call: any[]) => call[0].data.stake === 0)).toBe(true);
      expect(snapshotStub.captureForItem).toHaveBeenCalledTimes(2);
    });
  });

  describe('submit/remove', () => {
    it('rejects submit for non-open slips', async () => {
      prismaStub.betSlip.findUnique.mockResolvedValue({
        id: 'slip-1', userId: 'user-1', status: BetSlipStatus.SUBMITTED, items: [],
      });
      await expect(service.submit('slip-1', 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('rejects empty open slips', async () => {
      prismaStub.betSlip.findUnique.mockResolvedValue({
        id: 'slip-1', userId: 'user-1', status: BetSlipStatus.OPEN,
        structure: WagerStructure.SINGLE_BATCH, items: [],
      });
      await expect(service.submit('slip-1', 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('allows deletion only while OPEN', async () => {
      const slip = { id: 'slip-1', userId: 'user-1', status: BetSlipStatus.OPEN, items: [] };
      prismaStub.betSlip.findUnique.mockResolvedValue(slip);
      prismaStub.betSlip.delete.mockResolvedValue(slip);
      await service.remove('slip-1', 'user-1');
      expect(prismaStub.betSlip.delete).toHaveBeenCalledWith({ where: { id: 'slip-1' } });
    });
  });
});
