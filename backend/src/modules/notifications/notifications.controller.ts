import { Controller, Get, Post, Patch, Param, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  getAll(@Request() req, @Query('unread') unreadOnly?: string) {
    if (unreadOnly === 'true') return this.notificationsService.getUnread(req.user.id);
    return this.notificationsService.getAll(req.user.id);
  }

  @Get('count')
  getUnreadCount(@Request() req) {
    return this.notificationsService.getUnreadCount(req.user.id);
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string, @Request() req) {
    return this.notificationsService.markRead(id, req.user.id);
  }

  @Post('read-all')
  markAllRead(@Request() req) {
    return this.notificationsService.markAllRead(req.user.id);
  }

  /** Manually trigger alert evaluation for the current user */
  @Post('evaluate')
  evaluate(@Request() req) {
    return this.notificationsService.evaluateAlertsForUser(req.user.id).then(count => ({
      message: `Evaluated alerts — ${count} notification(s) fired`,
      fired: count,
    }));
  }
}
