import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BetSlipStatus } from '@prisma/client';
import { AddItemDto, CloseBetItemDto, UpdateSlipDto } from './dto/betslip.dto';
import { calculateClv } from '../analytics/clv';
import { WagerProjectionSnapshotService } from './wager-projection-snapshot.service';

@Injectable()
export class BetslipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectionSnapshots: WagerProjectionSnapshotService,
  ) {}

  async findAll(userId: string) {
    return this.prisma.betSlip.findMany({
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
  }

  async findOne(id: string, userId: string) {
    const slip = await this.prisma.betSlip.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            book: true,
            postBetReview: true,
            projectionSnapshot: true,
          },
        },
      },
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

    if (dto.bookId) {
      const book = await this.prisma.book.findUnique({ where: { id: dto.bookId } });
      if (!book?.isActive) throw new BadRequestException('Sportsbook is invalid or inactive');
    }

    const item = await this.prisma.betSlipItem.create({
      data: {
        betSlipId: id,
        marketId: dto.marketId,
        eventId: dto.eventId,
        bookId: dto.bookId,
        outcome: dto.outcome,
        odds: dto.odds,
        recommendedLine: dto.recommendedLine,
        direction: dto.direction as any,
        confidenceBucket: dto.confidenceBucket as any,
        decisionClass: dto.decisionClass as any,
        propStatType: dto.propStatType as any,
        seasonPhase: dto.seasonPhase as any,
        stake: dto.stake ?? 0,
        ev: dto.ev,
        recommendedAt: new Date(),
      },
      include: { book: true },
    });

    // Player-prop items receive an immutable Opportunity-First snapshot when a
    // defensible projection exists. Non-prop bets and insufficient-data props
    // keep their existing behavior; snapshot capture deliberately fails open.
    await this.projectionSnapshots.captureForItem(item.id);
    await this.recalcTotals(id);

    return this.prisma.betSlipItem.findUnique({
      where: { id: item.id },
      include: {
        book: true,
        projectionSnapshot: true,
      },
    });
  }

  async captureClosingMarket(
    id: string,
    itemId: string,
    userId: string,
    dto: CloseBetItemDto,
  ) {
    await this.findOne(id, userId);
    const item = await this.prisma.betSlipItem.findUnique({ where: { id: itemId } });
    if (!item || item.betSlipId !== id) throw new NotFoundException('Item not found on this slip');

    const clv = calculateClv({
      recommendedLine: item.recommendedLine,
      closingLine: dto.closingLine,
      recommendedOdds: item.odds,
      closingOdds: dto.closingOdds,
      direction: item.direction as any,
    });

    return this.prisma.betSlipItem.update({
      where: { id: itemId },
      data: {
        closingLine: dto.closingLine,
        closingOdds: dto.closingOdds,
        clvLine: clv.lineClv,
        clvPrice: clv.priceClv,
        closedAt: new Date(),
      },
      include: {
        book: true,
        postBetReview: true,
        projectionSnapshot: true,
      },
    });
  }

  async removeItem(id: string, itemId: string, userId: string) {
    const slip = await this.findOne(id, userId);
    if (slip.status !== BetSlipStatus.OPEN) {
      throw new BadRequestException('Cannot modify a submitted or settled bet slip');
    }
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
      include: {
        items: {
          include: {
            book: true,
            projectionSnapshot: true,
          },
        },
      },
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
    const totalStake = items.reduce((sum, item) => sum + item.stake, 0);
    const totalOdds = items.reduce((product, item) => {
      const decimal = item.odds > 0 ? item.odds / 100 + 1 : 100 / Math.abs(item.odds) + 1;
      return product * decimal;
    }, 1);
    await this.prisma.betSlip.update({
      where: { id: slipId },
      data: { totalStake, totalOdds: items.length > 0 ? totalOdds : null },
    });
  }
}
