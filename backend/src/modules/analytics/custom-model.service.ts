import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateModelDto, UpdateModelDto } from './dto/analytics.dto';

@Injectable()
export class CustomModelService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateModelDto) {
    return this.prisma.customModel.create({
      data: {
        userId,
        name: dto.name,
        description: dto.description,
        weights: dto.weights,
        isPublic: dto.isPublic ?? false,
      },
    });
  }

  async findAll(userId: string) {
    return this.prisma.customModel.findMany({
      where: { OR: [{ userId }, { isPublic: true }] },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, userId: string) {
    const model = await this.prisma.customModel.findFirst({
      where: { id, OR: [{ userId }, { isPublic: true }] },
      include: { performance: { orderBy: { calculatedAt: 'desc' }, take: 10 } },
    });
    if (!model) throw new NotFoundException('Model not found');
    return model;
  }

  async update(id: string, userId: string, dto: UpdateModelDto) {
    const model = await this.prisma.customModel.findFirst({ where: { id, userId } });
    if (!model) throw new NotFoundException('Model not found');

    return this.prisma.customModel.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.weights && { weights: dto.weights }),
        ...(dto.isPublic !== undefined && { isPublic: dto.isPublic }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async remove(id: string, userId: string) {
    const model = await this.prisma.customModel.findFirst({ where: { id, userId } });
    if (!model) throw new NotFoundException('Model not found');
    await this.prisma.customModel.delete({ where: { id } });
    return { message: 'Model deleted successfully' };
  }

  async duplicate(id: string, userId: string) {
    const model = await this.prisma.customModel.findFirst({
      where: { id, OR: [{ userId }, { isPublic: true }] },
    });
    if (!model) throw new NotFoundException('Model not found');

    return this.prisma.customModel.create({
      data: {
        userId,
        name: `${model.name} (Copy)`,
        description: model.description,
        weights: model.weights as any,
        isPublic: false,
      },
    });
  }
}
