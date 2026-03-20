import {
  Controller, Post, Get, Body, Req, Headers, RawBodyRequest,
  UseGuards, HttpCode, BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { BillingService } from './billing.service';
import { CreateCheckoutDto } from './billing.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('billing')
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post('checkout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a Stripe Checkout session for a PRO or PREMIUM plan' })
  createCheckout(@Body() dto: CreateCheckoutDto, @Req() req: any) {
    return this.billingService.createCheckoutSession(req.user.id, req.user.email, dto.plan);
  }

  @Post('portal')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Open the Stripe Billing Portal to manage or cancel a subscription' })
  createPortal(@Req() req: any) {
    return this.billingService.createPortalSession(req.user.id);
  }

  @Post('webhook')
  @HttpCode(200)
  @ApiOperation({ summary: 'Stripe webhook receiver (called by Stripe, not by users)' })
  webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    if (!req.rawBody) throw new BadRequestException('Missing raw body');
    return this.billingService.handleWebhook(req.rawBody, signature);
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current billing / subscription status for the logged-in user' })
  getStatus(@Req() req: any) {
    return this.billingService.getStatus(req.user.id);
  }
}
