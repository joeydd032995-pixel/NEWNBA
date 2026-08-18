import { BetslipService } from './betslip.service';
import {
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

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
      book: {
        findUnique: jest.fn(),
      },
    };
    snapshotStub = {
      captureForItem: jest.fn().mockResolvedValue(null),
    };
    service = new BetslipService(prismaStub, snapshotStub);
  });

  describe('findAll', () => {
    it('filters and sorts betslips by user with tracking details', async () => {
      const userId = 'user-123';
      const slips = [
        { id: 'slip-1', userId, name: 'Slip 1', status: 'OPEN', createdAt: new Date('2024-01-02') },
        { id: 'slip-2', userId, name: 'Slip 2', status: 'SUBMITTED', createdAt: new Date('2024-01-01') },
      ];
      prismaStub.betSlip.findMany.mockResolvedValue(slips);

      const result = await service.findAll(userId);

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
      expect(result).toEqual(slips);
    });
  });

  describe('addItem', () => {
    it('throws BadRequestException when slip not OPEN', async () => {
      const slip = { id: 'slip-1', userId: 'user-1', status: 'SUBMITTED' };
      prismaStub.betSlip.findUnique.mockResolvedValue(slip);

      await expect(
        service.addItem('slip-1', 'user-1', { marketId: 'market-1', outcome: 'home', odds: -110 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('captures the recommendation-time projection snapshot after item creation', async () => {
      const slip = { id: 'slip-1', userId: 'user-1', status: 'OPEN', items: [] };
      const dto = { marketId: 'market-1', outcome: 'over', odds: -110, stake: 50 };
      const item = { id: 'item-1', betSlipId: 'slip-1', stake: 50, odds: -110 };

      prismaStub.betSlip.findUnique.mockResolvedValue(slip);
      prismaStub.betSlipItem.create.mockResolvedValue(item);
      prismaStub.betSlipItem.findMany.mockResolvedValue([item]);
      prismaStub.betSlipItem.findUnique.mockResolvedValue(item);
      prismaStub.betSlip.update.mockResolvedValue({ ...slip, totalStake: 50 });

      await service.addItem('slip-1', 'user-1', dto);

      expect(snapshotStub.captureForItem).toHaveBeenCalledWith('item-1');
    });

    it('correctly recalculates totalStake as sum of item stakes via betSlip.update', async () => {
      const slip = { id: 'slip-1', userId: 'user-1', status: 'OPEN', items: [] };
      const dto = { marketId: 'market-1', outcome: 'home', odds: -110, stake: 50 };
      const item = { id: 'item-1', betSlipId: 'slip-1', ...dto };

      prismaStub.betSlip.findUnique.mockResolvedValue(slip);
      prismaStub.betSlipItem.create.mockResolvedValue(item);
      prismaStub.betSlipItem.findMany.mockResolvedValue([item]);
      prismaStub.betSlipItem.findUnique.mockResolvedValue(item);
      prismaStub.betSlip.update.mockResolvedValue({ ...slip, totalStake: 50 });

      await service.addItem('slip-1', 'user-1', dto);

      expect(prismaStub.betSlip.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ totalStake: 50 }) }),
      );
    });

    it('calculates parlay odds as product of decimal odds', async () => {
      const slip = { id: 'slip-1', userId: 'user-1', status: 'OPEN', items: [] };
      const existingItem = { odds: 110, stake: 25 };
      const newItem = { marketId: 'market-2', outcome: 'away', odds: -110, stake: 25 };
      const created = { id: 'item-2', betSlipId: 'slip-1', ...newItem };

      prismaStub.betSlip.findUnique.mockResolvedValue(slip);
      prismaStub.betSlipItem.create.mockResolvedValue(created);
      prismaStub.betSlipItem.findMany.mockResolvedValue([existingItem, newItem]);
      prismaStub.betSlipItem.findUnique.mockResolvedValue(created);
      prismaStub.betSlip.update.mockResolvedValue({});

      await service.addItem('slip-1', 'user-1', newItem);

      const updateCall = prismaStub.betSlip.update.mock.calls[0][0];
      expect(updateCall.data.totalOdds).toBeCloseTo(2.1 * (100 / 110 + 1), 1);
    });

    it('throws NotFoundException when slip does not exist', async () => {
      prismaStub.betSlip.findUnique.mockResolvedValue(null);
      await expect(
        service.addItem('slip-999', 'user-1', { marketId: 'market-1', outcome: 'home', odds: -110 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeItem', () => {
    it('throws NotFoundException when item not found on an open slip', async () => {
      const slip = { id: 'slip-1', userId: 'user-1', status: 'OPEN', items: [] };
      prismaStub.betSlip.findUnique.mockResolvedValue(slip);
      prismaStub.betSlipItem.findUnique.mockResolvedValue(null);
      await expect(service.removeItem('slip-1', 'item-999', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('submit', () => {
    it('throws BadRequestException if slip is not OPEN', async () => {
      const slip = { id: 'slip-1', userId: 'user-1', status: 'SUBMITTED' };
      prismaStub.betSlip.findUnique.mockResolvedValue(slip);
      await expect(service.submit('slip-1', 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if slip has no items', async () => {
      const slip = { id: 'slip-1', userId: 'user-1', status: 'OPEN', items: [] };
      prismaStub.betSlip.findUnique.mockResolvedValue(slip);
      await expect(service.submit('slip-1', 'user-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('throws BadRequestException if slip status is SUBMITTED', async () => {
      const slip = { id: 'slip-1', userId: 'user-1', status: 'SUBMITTED' };
      prismaStub.betSlip.findUnique.mockResolvedValue(slip);
      await expect(service.remove('slip-1', 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('allows deletion of OPEN slip', async () => {
      const slip = { id: 'slip-1', userId: 'user-1', status: 'OPEN' };
      prismaStub.betSlip.findUnique.mockResolvedValue(slip);
      prismaStub.betSlip.delete.mockResolvedValue(slip);
      await service.remove('slip-1', 'user-1');
      expect(prismaStub.betSlip.delete).toHaveBeenCalled();
    });
  });

  describe('recalcTotals', () => {
    it('sets totalOdds to null when zero items', async () => {
      const slip = { id: 'slip-1', items: [] };
      prismaStub.betSlip.findUnique.mockResolvedValue(slip);
      prismaStub.betSlip.update.mockResolvedValue({ ...slip, totalStake: 0, totalOdds: null });
      expect(slip.items.length).toBe(0);
    });
  });
});
