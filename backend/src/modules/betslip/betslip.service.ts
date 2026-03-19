import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BetSlipStatus } from '@prisma/client';
import { AddItemDto, UpdateSlipDto } from './dto/betslip.dto';

@Injectable()
export class BetslipService {
  constructor(private prisma: PrismaService) {}

  async findAll(userId: string) {
    return this.prisma.betSlip.findMany({
      where: { userId },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, userId: string) {
    const slip = await this.prisma.betSlip.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!slip) throw new NotFoundException('Bet slip not found');
    if (slip.userId !== userId) throw new ForbiddenException();
    return slip;
  }

  async create(userId: string, name?: string) {
    return this.prisma.betSlip.create({
      data: { userId, name },
      include: { items: true },
    });
  }

  async addItem(id: string, userId: string, dto: AddItemDto) {
    const slip = await this.findOne(id, userId);
    if (slip.status !== BetSlipStatus.OPEN) {
      throw new BadRequestException('Cannot modify a submitted or settled bet slip');
    }
    const item = await this.prisma.betSlipItem.create({
      data: { betSlipId: id, ...dto },
    });
    await this.recalcTotals(id);
    return item;
  }

  async removeItem(id: string, itemId: string, userId: string) {
    await this.findOne(id, userId);
    const item = await this.prisma.betSlipItem.findUnique({ where: { id: itemId } });
    if (!item || item.betSlipId !== id) throw new NotFoundException('Item not found on this slip');
    await this.prisma.betSlipItem.delete({ where: { id: itemId } });
    await this.recalcTotals(id);
    return { message: 'Item removed' };
  }

  async update(id: string, userId: string, dto: UpdateSlipDto) {
    await this.findOne(id, userId);
    return this.prisma.betSlip.update({ where: { id }, data: dto });
  }

  async submit(id: string, userId: string) {
    const slip = await this.findOne(id, userId);
    if (slip.status !== BetSlipStatus.OPEN) {
      throw new BadRequestException('Bet slip is not open');
    }
    if (slip.items.length === 0) {
      throw new BadRequestException('Cannot submit an empty bet slip');
    }
    return this.prisma.betSlip.update({
      where: { id },
      data: { status: BetSlipStatus.SUBMITTED },
      include: { items: true },
    });
  }

  async remove(id: string, userId: string) {
    const slip = await this.findOne(id, userId);
    if (slip.status === BetSlipStatus.SUBMITTED) {
      throw new BadRequestException('Cannot delete a submitted bet slip');
    }
    await this.prisma.betSlip.delete({ where: { id } });
    return { message: 'Bet slip deleted' };
  }

  private async recalcTotals(slipId: string) {
    const items = await this.prisma.betSlipItem.findMany({ where: { betSlipId: slipId } });
    const totalStake = items.reduce((sum, i) => sum + i.stake, 0);
    // Parlay odds = product of all decimal odds
    const totalOdds = items.reduce((prod, i) => {
      const decimal = i.odds > 0 ? i.odds / 100 + 1 : 100 / Math.abs(i.odds) + 1;
      return prod * decimal;
    }, 1);
    await this.prisma.betSlip.update({
      where: { id: slipId },
      data: { totalStake, totalOdds: items.length > 0 ? totalOdds : null },
    });
  }
}
