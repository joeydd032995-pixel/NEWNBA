import { Controller, Get, Post, Patch, Delete, Param, Body, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BetslipService } from './betslip.service';
import { CreateBetSlipDto, AddItemDto, CloseBetItemDto, SubmitTrackedSlipDto, UpdateSlipDto } from './dto/betslip.dto';

@ApiTags('Bet Slip')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('betslip')
export class BetslipController {
  constructor(private betslipService: BetslipService) {}

  @Get()
  findAll(@Request() req) {
    return this.betslipService.findAll(req.user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.betslipService.findOne(id, req.user.id);
  }

  @Post()
  create(@Body() dto: CreateBetSlipDto, @Request() req) {
    return this.betslipService.create(req.user.id, dto.name);
  }

  @Post('submit-tracked')
  createAndSubmitTracked(@Body() dto: SubmitTrackedSlipDto, @Request() req) {
    return this.betslipService.createAndSubmitTracked(req.user.id, dto);
  }

  @Post(':id/items')
  addItem(@Param('id') id: string, @Body() dto: AddItemDto, @Request() req) {
    return this.betslipService.addItem(id, req.user.id, dto);
  }

  @Patch(':id/items/:itemId/closing-market')
  captureClosingMarket(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: CloseBetItemDto,
    @Request() req,
  ) {
    return this.betslipService.captureClosingMarket(id, itemId, req.user.id, dto);
  }

  @Delete(':id/items/:itemId')
  removeItem(@Param('id') id: string, @Param('itemId') itemId: string, @Request() req) {
    return this.betslipService.removeItem(id, itemId, req.user.id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSlipDto, @Request() req) {
    return this.betslipService.update(id, req.user.id, dto);
  }

  @Post(':id/submit')
  submit(@Param('id') id: string, @Request() req) {
    return this.betslipService.submit(id, req.user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    return this.betslipService.remove(id, req.user.id);
  }
}