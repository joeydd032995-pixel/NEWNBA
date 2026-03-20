import { Controller, Get, Post, Patch, Delete, Param, Body, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlanGuard } from '../auth/guards/plan.guard';
import { RequiresPlan } from '../auth/decorators/require-plan.decorator';
import { AlertsService } from './alerts.service';
import { CreateAlertDto, UpdateAlertDto } from './dto/alerts.dto';

@ApiTags('Alerts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PlanGuard)
@RequiresPlan('PRO')
@Controller('alerts')
export class AlertsController {
  constructor(private alertsService: AlertsService) {}

  @Get()
  findAll(@Request() req) {
    return this.alertsService.findAll(req.user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.alertsService.findOne(id, req.user.id);
  }

  @Post()
  create(@Body() dto: CreateAlertDto, @Request() req) {
    return this.alertsService.create(req.user.id, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAlertDto, @Request() req) {
    return this.alertsService.update(id, req.user.id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    return this.alertsService.remove(id, req.user.id);
  }

  @Patch(':id/toggle')
  toggle(@Param('id') id: string, @Request() req) {
    return this.alertsService.toggle(id, req.user.id);
  }
}
