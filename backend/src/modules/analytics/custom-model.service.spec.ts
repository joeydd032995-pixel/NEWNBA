import { CustomModelService } from './custom-model.service';
import { NotFoundException } from '@nestjs/common';

describe('CustomModelService', () => {
  let service: CustomModelService;
  let prismaStub: any;

  beforeEach(() => {
    prismaStub = {
      customModel: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    service = new CustomModelService(prismaStub);
  });

  describe('create', () => {
    it('stores weights as-is and defaults isPublic to false', async () => {
      const userId = 'user-123';
      const dto = {
        name: 'My Model',
        description: 'Test model',
        weights: { efg: 0.4, ts: 0.3, netRtg: 0.3 },
      };
      const createdModel = {
        id: 'model-1',
        userId,
        ...dto,
        isPublic: false,
        isActive: true,
      };
      prismaStub.customModel.create.mockResolvedValue(createdModel);

      const result = await service.create(userId, dto);

      expect(prismaStub.customModel.create).toHaveBeenCalledWith({
        data: {
          userId,
          name: dto.name,
          description: dto.description,
          weights: dto.weights,
          isPublic: false,
        },
      });
      expect(result.isPublic).toBe(false);
    });
  });

  describe('findAll', () => {
    it('returns union of own models and public models', async () => {
      const userId = 'user-123';
      const models = [
        { id: 'model-1', userId, name: 'Own Model', isPublic: false },
        { id: 'model-2', userId: 'other-user', name: 'Public Model', isPublic: true },
      ];
      prismaStub.customModel.findMany.mockResolvedValue(models);

      const result = await service.findAll(userId);

      expect(prismaStub.customModel.findMany).toHaveBeenCalledWith({
        where: { OR: [{ userId }, { isPublic: true }] },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual(models);
    });
  });

  describe('findOne', () => {
    it('returns own model when found', async () => {
      const userId = 'user-123';
      const model = {
        id: 'model-1',
        userId,
        name: 'My Model',
        isPublic: false,
      };
      prismaStub.customModel.findFirst.mockResolvedValue(model);

      const result = await service.findOne('model-1', userId);

      expect(result).toEqual(model);
    });

    it('returns public model even if not owner', async () => {
      const model = {
        id: 'model-public',
        userId: 'other-user',
        name: 'Public Model',
        isPublic: true,
      };
      prismaStub.customModel.findFirst.mockResolvedValue(model);

      const result = await service.findOne('model-public', 'user-123');

      expect(result).toEqual(model);
    });

    it('throws NotFoundException if not owner and not public', async () => {
      prismaStub.customModel.findFirst.mockResolvedValue(null);

      await expect(service.findOne('model-1', 'user-123')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('allows only owner to modify', async () => {
      const userId = 'user-123';
      const modelId = 'model-1';
      const existingModel = { id: modelId, userId, name: 'Old Name', weights: {} };
      const updateDto = { name: 'New Name' };

      prismaStub.customModel.findFirst.mockResolvedValue(existingModel);
      prismaStub.customModel.update.mockResolvedValue({
        ...existingModel,
        name: 'New Name',
      });

      const result = await service.update(modelId, userId, updateDto);

      expect(result.name).toBe('New Name');
    });

    it('performs partial update without affecting other fields', async () => {
      const userId = 'user-123';
      const existingModel = {
        id: 'model-1',
        userId,
        name: 'Old Name',
        description: 'Desc',
        isPublic: false,
      };
      const updateDto = { name: 'New Name' };

      prismaStub.customModel.findFirst.mockResolvedValue(existingModel);
      prismaStub.customModel.update.mockResolvedValue({
        ...existingModel,
        ...updateDto,
      });

      const result = await service.update('model-1', userId, updateDto);

      expect(result.name).toBe('New Name');
      expect(result.description).toBe('Desc');
    });

    it('throws NotFoundException if not owner', async () => {
      prismaStub.customModel.findFirst.mockResolvedValue(null);

      await expect(
        service.update('model-1', 'user-123', { name: 'New' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('deletes model when user is owner', async () => {
      const userId = 'user-123';
      const modelId = 'model-1';
      prismaStub.customModel.findFirst.mockResolvedValue({
        id: modelId,
        userId,
      });
      prismaStub.customModel.delete.mockResolvedValue({ id: modelId });

      const result = await service.remove(modelId, userId);

      expect(prismaStub.customModel.delete).toHaveBeenCalledWith({
        where: { id: modelId },
      });
      expect(result.message).toContain('deleted');
    });

    it('throws NotFoundException if not owner', async () => {
      prismaStub.customModel.findFirst.mockResolvedValue(null);

      await expect(service.remove('model-1', 'user-123')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('duplicate', () => {
    it('creates copy with "(Copy)" suffix and resets isPublic to false', async () => {
      const userId = 'user-123';
      const originalModel = {
        id: 'model-1',
        userId: 'other-user',
        name: 'Public Model',
        description: 'Original description',
        weights: { a: 0.5, b: 0.5 },
        isPublic: true,
      };
      const copiedModel = {
        id: 'model-copy',
        userId,
        name: 'Public Model (Copy)',
        description: 'Original description',
        weights: { a: 0.5, b: 0.5 },
        isPublic: false,
      };

      prismaStub.customModel.findFirst.mockResolvedValue(originalModel);
      prismaStub.customModel.create.mockResolvedValue(copiedModel);

      const result = await service.duplicate('model-1', userId);

      expect(result.name).toBe('Public Model (Copy)');
      expect(result.isPublic).toBe(false);
      expect(result.userId).toBe(userId);
      expect(result.weights).toEqual(originalModel.weights);
    });
  });
});
