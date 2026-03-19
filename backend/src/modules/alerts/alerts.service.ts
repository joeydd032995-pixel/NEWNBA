import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAlertDto, UpdateAlertDto } from './dto/alerts.dto';

@Injectable()
export class AlertsService {
  constructor(private prisma: PrismaService) {}

  async findAll(userId: string) {
    return this.prisma.alert.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, userId: string) {
    const alert = await this.prisma.alert.findUnique({ where: { id } });
    if (!alert) throw new NotFoundException('Alert not found');
    if (alert.userId !== userId) throw new ForbiddenException();
    return alert;
  }

  async create(userId: string, dto: CreateAlertDto) {
    return this.prisma.alert.create({
      data: { userId, name: dto.name, type: dto.type, conditions: dto.conditions },
    });
  }

  async update(id: string, userId: string, dto: UpdateAlertDto) {
    await this.findOne(id, userId);
    return this.prisma.alert.update({
      where: { id },
      data: { ...dto },
    });
  }

  async remove(id: string, userId: string) {
    await this.findOne(id, userId);
    await this.prisma.alert.delete({ where: { id } });
    return { message: 'Alert deleted' };
  }

  async toggle(id: string, userId: string) {
    const alert = await this.findOne(id, userId);
    return this.prisma.alert.update({
      where: { id },
      data: { isActive: !alert.isActive },
    });
  }
}
