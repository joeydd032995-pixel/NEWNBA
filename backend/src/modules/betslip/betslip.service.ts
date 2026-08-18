import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BetSlipStatus, WagerStructure } from '@prisma/client';
import {
  AddItemDto,
  CloseBetItemDto,
  SubmitTrackedParlayDto,
  SubmitTrackedSlipDto,
  UpdateSlipDto,
} from './dto/betslip.dto';
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
      data: { userId, name, structure: WagerStructure.SINGLE_BATCH },
      include: { items: true },
    });
  }

  async addItem(id: string, userId: string, dto: AddItemDto) {
    const slip = await this.findOne(id, userId);
    if (slip.status !== BetSlipStatus.OPEN) {
      throw new BadRequestException('Cannot modify a submitted or settled bet slip');
    }

    await this.validateTrackedItems([dto], false);

    const item = await this.prisma.betSlipItem.create({
      data: this.toItemCreateData(id, dto, slip.structure === WagerStructure.PARLAY ? 0 : undefined),
      include: { book: true },
    });

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

  /**
   * Persist a batch of independently staked wagers. Each item settles and is
   * attributed independently; the slip is only a tracking container.
   */
  async createAndSubmitTracked(userId: string, dto: SubmitTrackedSlipDto) {
    if (!dto.items.length) throw new BadRequestException('Cannot submit an empty bet slip');
    await this.validateTrackedItems(dto.items, true);

    const totalStake = dto.items.reduce((sum, item) => sum + Math.max(0, item.stake ?? 0), 0);
    const recommendedAt = new Date();

    const created = await this.prisma.$transaction(async (tx) => {
      const slip = await tx.betSlip.create({
        data: {
          userId,
          name: dto.name,
          structure: WagerStructure.SINGLE_BATCH,
          totalStake,
          totalOdds: null,
          ticketStake: null,
          status: BetSlipStatus.OPEN,
        },
      });

      const items: Array<{ id: string }> = [];
      for (const itemDto of dto.items) {
        const item = await tx.betSlipItem.create({
          data: {
            ...this.toItemCreateData(slip.id, itemDto),
            recommendedAt,
          },
          select: { id: true },
        });
        items.push(item);
      }

      await tx.betSlip.update({
        where: { id: slip.id },
        data: { status: BetSlipStatus.SUBMITTED },
      });

      return { slipId: slip.id, items };
    });

    await this.captureSnapshots(created.items);
    return this.findOne(created.slipId, userId);
  }

  /**
   * Persist a true parlay: one ticket stake and one compounded price. Leg stake
   * fields remain zero so downstream accounting cannot double-count the ticket.
   */
  async createAndSubmitParlay(userId: string, dto: SubmitTrackedParlayDto) {
    if (dto.items.length < 2) throw new BadRequestException('Parlay requires at least two legs');
    await this.validateTrackedItems(dto.items, true);

    const totalOdds = dto.items.reduce(
      (product, item) => product * americanToDecimal(item.odds),
      1,
    );
    const recommendedAt = new Date();

    const created = await this.prisma.$transaction(async (tx) => {
      const slip = await tx.betSlip.create({
        data: {
          userId,
          name: dto.name,
          structure: WagerStructure.PARLAY,
          totalStake: dto.ticketStake,
          ticketStake: dto.ticketStake,
          totalOdds,
          status: BetSlipStatus.OPEN,
        },
      });

      const items: Array<{ id: string }> = [];
      for (const itemDto of dto.items) {
        const item = await tx.betSlipItem.create({
          data: {
            ...this.toItemCreateData(slip.id, itemDto, 0),
            recommendedAt,
          },
          select: { id: true },
        });
        items.push(item);
      }

      await tx.betSlip.update({
        where: { id: slip.id },
        data: { status: BetSlipStatus.SUBMITTED },
      });
      return { slipId: slip.id, items };
    });

    await this.captureSnapshots(created.items);
    return this.findOne(created.slipId, userId);
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
    const slip = await this.findOne(id, userId);
    if (slip.status !== BetSlipStatus.OPEN) {
      throw new BadRequestException('Cannot modify a submitted or settled bet slip');
    }
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
    if (slip.structure === WagerStructure.PARLAY && slip.items.length < 2) {
      throw new BadRequestException('Parlay requires at least two legs');
    }
    await this.recalcTotals(id);
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
    if (slip.status !== BetSlipStatus.OPEN) {
      throw new BadRequestException('Cannot delete a submitted or settled bet slip');
    }
    await this.prisma.betSlip.delete({ where: { id } });
    return { message: 'Bet slip deleted' };
  }

  private async captureSnapshots(items: Array<{ id: string }>) {
    for (const item of items) {
      await this.projectionSnapshots.captureForItem(item.id);
    }
  }

  private toItemCreateData(slipId: string, dto: AddItemDto, stakeOverride?: number) {
    return {
      betSlipId: slipId,
      marketId: dto.marketId,
      eventId: dto.eventId,
      bookId: dto.bookId,
      outcome: dto.outcome.trim().toLowerCase(),
      odds: dto.odds,
      recommendedLine: dto.recommendedLine,
      direction: dto.direction as any,
      confidenceBucket: dto.confidenceBucket as any,
      decisionClass: dto.decisionClass as any,
      propStatType: dto.propStatType as any,
      seasonPhase: dto.seasonPhase as any,
      stake: stakeOverride ?? dto.stake ?? 0,
      ev: dto.ev,
      recommendedAt: new Date(),
    };
  }

  private async validateTrackedItems(items: AddItemDto[], requireMarketAndEvent: boolean) {
    for (const item of items) {
      if (!Number.isFinite(item.odds) || item.odds === 0) {
        throw new BadRequestException('Tracked wager odds must be a non-zero finite American price');
      }
      if ((item.stake ?? 0) < 0) throw new BadRequestException('Tracked wager stake cannot be negative');
      if (requireMarketAndEvent && (!item.marketId || !item.eventId)) {
        throw new BadRequestException('Tracked wager requires both marketId and eventId');
      }
    }

    const marketIds = [...new Set(items.map((item) => item.marketId).filter((value): value is string => !!value))];
    if (marketIds.length) {
      const markets = await this.prisma.market.findMany({
        where: { id: { in: marketIds } },
        select: { id: true, eventId: true, isActive: true },
      });
      const byId = new Map(markets.map((market) => [market.id, market]));
      for (const item of items) {
        if (!item.marketId) continue;
        const market = byId.get(item.marketId);
        if (!market || !market.isActive) throw new BadRequestException(`Market ${item.marketId} is invalid or inactive`);
        if (item.eventId && market.eventId !== item.eventId) {
          throw new BadRequestException(`Market ${item.marketId} does not belong to event ${item.eventId}`);
        }
      }
    }

    const bookIds = [...new Set(items.map((item) => item.bookId).filter((value): value is string => !!value))];
    if (bookIds.length) {
      const books = await this.prisma.book.findMany({
        where: { id: { in: bookIds }, isActive: true },
        select: { id: true },
      });
      const activeBooks = new Set(books.map((book) => book.id));
      const invalid = bookIds.find((bookId) => !activeBooks.has(bookId));
      if (invalid) throw new BadRequestException(`Sportsbook ${invalid} is invalid or inactive`);
    }
  }

  private async recalcTotals(slipId: string) {
    const slip = await this.prisma.betSlip.findUnique({
      where: { id: slipId },
      select: { structure: true, ticketStake: true },
    });
    if (!slip) return;

    const items = await this.prisma.betSlipItem.findMany({ where: { betSlipId: slipId } });
    if (slip.structure === WagerStructure.PARLAY) {
      const totalOdds = items.reduce((product, item) => product * americanToDecimal(item.odds), 1);
      const ticketStake = slip.ticketStake ?? 0;
      await this.prisma.betSlip.update({
        where: { id: slipId },
        data: {
          totalStake: ticketStake,
          totalOdds: items.length > 0 ? totalOdds : null,
        },
      });
      return;
    }

    const totalStake = items.reduce((sum, item) => sum + item.stake, 0);
    await this.prisma.betSlip.update({
      where: { id: slipId },
      data: { totalStake, totalOdds: null, ticketStake: null },
    });
  }
}

function americanToDecimal(odds: number): number {
  return odds > 0 ? odds / 100 + 1 : 100 / Math.abs(odds) + 1;
}
