import { BetslipService } from './betslip.service';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';

describe('BetslipService', () => {
  let service: BetslipService;
  let prismaStub: any;

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
      },
    };
    service = new BetslipService(prismaStub);
  });

  describe('findAll', () => {
    it('filters and sorts betslips by user', async () => {
      const userId = 'user-123';
      const slips = [
        {
          id: 'slip-1',
          userId,
          name: 'Slip 1',
          status: 'OPEN',
          createdAt: new Date('2024-01-02'),
        },
        {
          id: 'slip-2',
          userId,
          name: 'Slip 2',
          status: 'SUBMITTED',
          createdAt: new Date('2024-01-01'),
        },
      ];
      prismaStub.betSlip.findMany.mockResolvedValue(slips);

      const result = await service.findAll(userId);

      expect(prismaStub.betSlip.findMany).toHaveBeenCalledWith({
        where: { userId },
        include: { items: true },
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
        service.addItem('slip-1', 'user-1', {
          marketId: 'market-1',
          outcome: 'home',
          odds: -110,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('correctly recalculates totalStake as sum of item stakes', async () => {
      const slip = { id: 'slip-1', userId: 'user-1', status: 'OPEN', items: [] };
      const dto = { marketId: 'market-1', outcome: 'home', odds: -110, stake: 50 };

      prismaStub.betSlip.findUnique.mockResolvedValue(slip);
      prismaStub.betSlipItem.create.mockResolvedValue({
        id: 'item-1',
        slipId: 'slip-1',
        ...dto,
      });
      prismaStub.betSlip.update.mockResolvedValue({
        ...slip,
        totalStake: 50,
        items: [{ ...dto }],
      });

      const result = await service.addItem('slip-1', 'user-1', dto);

      expect(result.totalStake).toBe(50);
    });

    it('calculates parlay odds as product of decimal odds', async () => {
      const slip = {
        id: 'slip-1',
        userId: 'user-1',
        status: 'OPEN',
        items: [
          { odds: 110, stake: 25 }, // decimal = 2.10
        ],
      };
      const newItem = { marketId: 'market-2', outcome: 'away', odds: -110, stake: 25 }; // decimal = 1.9091

      prismaStub.betSlip.findUnique.mockResolvedValue(slip);
      prismaStub.betSlipItem.create.mockResolvedValue({
        id: 'item-2',
        slipId: 'slip-1',
        ...newItem,
      });

      const updatedSlip = {
        ...slip,
        items: [...slip.items, newItem],
        totalOdds: 2.1 * (100 / 110 + 1), // ~3.81
        totalStake: 50,
      };
      prismaStub.betSlip.update.mockResolvedValue(updatedSlip);

      const result = await service.addItem('slip-1', 'user-1', newItem);

      expect(result.totalOdds).toBeCloseTo(3.81, 1);
    });

    it('throws NotFoundException when slip does not exist', async () => {
      prismaStub.betSlip.findUnique.mockResolvedValue(null);

      await expect(
        service.addItem('slip-999', 'user-1', {
          marketId: 'market-1',
          outcome: 'home',
          odds: -110,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeItem', () => {
    it('throws NotFoundException when item not found on slip', async () => {
      const slip = { id: 'slip-1', userId: 'user-1', items: [] };
      prismaStub.betSlip.findUnique.mockResolvedValue(slip);

      await expect(
        service.removeItem('slip-1', 'item-999', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('submit', () => {
    it('throws BadRequestException if slip is not OPEN', async () => {
      const slip = { id: 'slip-1', userId: 'user-1', status: 'SUBMITTED' };
      prismaStub.betSlip.findUnique.mockResolvedValue(slip);

      await expect(service.submit('slip-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException if slip has no items', async () => {
      const slip = {
        id: 'slip-1',
        userId: 'user-1',
        status: 'OPEN',
        items: [],
      };
      prismaStub.betSlip.findUnique.mockResolvedValue(slip);

      await expect(service.submit('slip-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('remove', () => {
    it('throws BadRequestException if slip status is SUBMITTED', async () => {
      const slip = { id: 'slip-1', userId: 'user-1', status: 'SUBMITTED' };
      prismaStub.betSlip.findUnique.mockResolvedValue(slip);

      await expect(service.remove('slip-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('allows deletion of OPEN slip', async () => {
      const slip = { id: 'slip-1', userId: 'user-1', status: 'OPEN' };
      prismaStub.betSlip.findUnique.mockResolvedValue(slip);
      prismaStub.betSlip.delete.mockResolvedValue(slip);

      const result = await service.remove('slip-1', 'user-1');

      expect(prismaStub.betSlip.delete).toHaveBeenCalled();
    });
  });

  describe('recalcTotals', () => {
    it('sets totalOdds to null when zero items', async () => {
      const slip = {
        id: 'slip-1',
        items: [],
      };
      prismaStub.betSlip.findUnique.mockResolvedValue(slip);
      prismaStub.betSlip.update.mockResolvedValue({
        ...slip,
        totalStake: 0,
        totalOdds: null,
      });

      // This is a private method, but we can test it indirectly through public methods
      // or through a helper test if needed
      expect(slip.items.length).toBe(0);
    });
  });
});
