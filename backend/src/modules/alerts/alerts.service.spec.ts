import { AlertsService } from './alerts.service';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

describe('AlertsService', () => {
  let service: AlertsService;
  let prismaStub: any;

  beforeEach(() => {
    prismaStub = {
      alert: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    service = new AlertsService(prismaStub);
  });

  describe('findAll', () => {
    it('returns only user\'s own alerts ordered by recency', async () => {
      const userId = 'user-123';
      const alerts = [
        { id: 'alert-1', userId, name: 'Alert 1', createdAt: new Date('2024-01-02') },
        { id: 'alert-2', userId, name: 'Alert 2', createdAt: new Date('2024-01-01') },
      ];
      prismaStub.alert.findMany.mockResolvedValue(alerts);

      const result = await service.findAll(userId);

      expect(prismaStub.alert.findMany).toHaveBeenCalledWith({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual(alerts);
    });

    it('returns empty array when user has no alerts', async () => {
      prismaStub.alert.findMany.mockResolvedValue([]);
      const result = await service.findAll('user-456');
      expect(result).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('returns alert when user is owner', async () => {
      const userId = 'user-123';
      const alert = { id: 'alert-1', userId, name: 'Test Alert' };
      prismaStub.alert.findUnique.mockResolvedValue(alert);

      const result = await service.findOne('alert-1', userId);

      expect(result).toEqual(alert);
    });

    it('throws NotFoundException when alert does not exist', async () => {
      prismaStub.alert.findUnique.mockResolvedValue(null);

      await expect(service.findOne('alert-999', 'user-123')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when user is not owner', async () => {
      const alert = { id: 'alert-1', userId: 'user-other', name: 'Test Alert' };
      prismaStub.alert.findUnique.mockResolvedValue(alert);

      await expect(service.findOne('alert-1', 'user-123')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('create', () => {
    it('persists alert with correct userId and conditions', async () => {
      const userId = 'user-123';
      const dto = {
        name: 'High EV Alert',
        type: 'EV_THRESHOLD',
        conditions: { minEV: 5, sport: 'NBA' },
      };
      const createdAlert = { id: 'alert-new', userId, ...dto };
      prismaStub.alert.create.mockResolvedValue(createdAlert);

      const result = await service.create(userId, dto);

      expect(prismaStub.alert.create).toHaveBeenCalledWith({
        data: { userId, ...dto },
      });
      expect(result).toEqual(createdAlert);
    });
  });

  describe('update', () => {
    it('updates alert when user is owner', async () => {
      const userId = 'user-123';
      const alertId = 'alert-1';
      const existingAlert = { id: alertId, userId, name: 'Old Name', isActive: true };
      const updateDto = { name: 'New Name' };

      prismaStub.alert.findUnique.mockResolvedValue(existingAlert);
      prismaStub.alert.update.mockResolvedValue({ ...existingAlert, ...updateDto });

      const result = await service.update(alertId, userId, updateDto);

      expect(result.name).toBe('New Name');
      expect(prismaStub.alert.update).toHaveBeenCalledWith({
        where: { id: alertId },
        data: updateDto,
      });
    });

    it('throws ForbiddenException when user is not owner', async () => {
      prismaStub.alert.findUnique.mockResolvedValue({
        id: 'alert-1',
        userId: 'other-user',
      });

      await expect(
        service.update('alert-1', 'user-123', { name: 'New Name' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('remove', () => {
    it('deletes alert when user is owner', async () => {
      const userId = 'user-123';
      const alertId = 'alert-1';
      prismaStub.alert.findUnique.mockResolvedValue({
        id: alertId,
        userId,
      });
      prismaStub.alert.delete.mockResolvedValue({ id: alertId });

      const result = await service.remove(alertId, userId);

      expect(prismaStub.alert.delete).toHaveBeenCalledWith({ where: { id: alertId } });
      expect(result.message).toContain('deleted');
    });

    it('throws ForbiddenException when user is not owner', async () => {
      prismaStub.alert.findUnique.mockResolvedValue({
        id: 'alert-1',
        userId: 'other-user',
      });

      await expect(service.remove('alert-1', 'user-123')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('toggle', () => {
    it('toggles isActive flag and preserves other fields', async () => {
      const userId = 'user-123';
      const alertId = 'alert-1';
      const alert = {
        id: alertId,
        userId,
        name: 'Test Alert',
        isActive: true,
      };

      prismaStub.alert.findUnique.mockResolvedValue(alert);
      prismaStub.alert.update.mockResolvedValue({ ...alert, isActive: false });

      const result = await service.toggle(alertId, userId);

      expect(prismaStub.alert.update).toHaveBeenCalledWith({
        where: { id: alertId },
        data: { isActive: false },
      });
      expect(result.isActive).toBe(false);
      expect(result.name).toBe('Test Alert');
    });
  });
});
