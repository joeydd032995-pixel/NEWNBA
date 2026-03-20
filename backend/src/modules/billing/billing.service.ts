import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { PlanType, SubscriptionStatus } from '@prisma/client';

const STRIPE_STATUS_TO_SUBSCRIPTION: Record<string, SubscriptionStatus> = {
  active: SubscriptionStatus.ACTIVE,
  trialing: SubscriptionStatus.TRIALING,
  past_due: SubscriptionStatus.ACTIVE,
  canceled: SubscriptionStatus.CANCELED,
  unpaid: SubscriptionStatus.EXPIRED,
};

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly stripe: Stripe;
  private readonly frontendUrl: string;
  private readonly proPriceId: string;
  private readonly premiumPriceId: string;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    this.stripe = new Stripe(this.config.get<string>('STRIPE_SECRET_KEY', ''), {
      apiVersion: '2026-02-25.clover',
    });
    this.frontendUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:5173');
    this.proPriceId = this.config.get<string>('STRIPE_PRO_PRICE_ID', '');
    this.premiumPriceId = this.config.get<string>('STRIPE_PREMIUM_PRICE_ID', '');
  }

  async createCheckoutSession(userId: string, userEmail: string, plan: 'PRO' | 'PREMIUM') {
    const priceId = plan === 'PRO' ? this.proPriceId : this.premiumPriceId;
    if (!priceId) throw new BadRequestException(`Price ID for ${plan} plan is not configured`);

    let user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, stripeCustomerId: true },
    });
    if (!user) throw new NotFoundException('User not found');

    if (!user.stripeCustomerId) {
      const customer = await this.stripe.customers.create({
        email: userEmail,
        metadata: { userId },
      });
      user = await this.prisma.user.update({
        where: { id: userId },
        data: { stripeCustomerId: customer.id },
        select: { id: true, stripeCustomerId: true },
      });
    }

    const session = await this.stripe.checkout.sessions.create({
      customer: user.stripeCustomerId!,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      // Embed the plan so the webhook doesn't need a separate subscription.retrieve call
      metadata: { plan },
      success_url: `${this.frontendUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${this.frontendUrl}/pricing`,
      allow_promotion_codes: true,
    });

    return { url: session.url };
  }

  async createPortalSession(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { stripeCustomerId: true },
    });
    if (!user?.stripeCustomerId) {
      throw new BadRequestException('No billing account found — subscribe first');
    }

    const session = await this.stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${this.frontendUrl}/billing`,
    });

    return { url: session.url };
  }

  async handleWebhook(rawBody: Buffer, signature: string) {
    const secret = this.config.get<string>('STRIPE_WEBHOOK_SECRET', '');
    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch {
      throw new BadRequestException('Invalid Stripe webhook signature');
    }

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await this.handleSubscriptionChange(event.data.object as Stripe.Subscription);
        break;
      default:
        break;
    }
  }

  async getStatus(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { planType: true, subscriptionStatus: true, trialEndsAt: true, subscriptionId: true },
    });
  }

  private async handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    if (!session.customer || !session.subscription) return;

    const customerId = this.resolveStripeId(session.customer);
    const subscriptionId = this.resolveStripeId(session.subscription);

    // Plan is embedded in session metadata — no extra Stripe API call needed
    const plan = (session.metadata?.plan as PlanType) ?? PlanType.PRO;

    await this.prisma.user.updateMany({
      where: { stripeCustomerId: customerId },
      data: {
        subscriptionId,
        planType: plan,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        trialEndsAt: null,
      },
    });

    this.logger.log(`Checkout completed: customer ${customerId} → ${plan}`);
  }

  private async handleSubscriptionChange(subscription: Stripe.Subscription) {
    const customerId = this.resolveStripeId(subscription.customer);
    const rawStatus = subscription.status;
    const subscriptionStatus = STRIPE_STATUS_TO_SUBSCRIPTION[rawStatus] ?? SubscriptionStatus.EXPIRED;
    const isCanceled = subscription.status === 'canceled';

    await this.prisma.user.updateMany({
      where: { stripeCustomerId: customerId },
      data: {
        planType: isCanceled ? PlanType.FREE : this.resolvePlanType(subscription),
        subscriptionStatus,
      },
    });

    this.logger.log(`Subscription ${subscription.id} → ${rawStatus}`);
  }

  /** Unwrap a Stripe expandable field to its string ID. */
  private resolveStripeId(obj: string | { id: string }): string {
    return typeof obj === 'string' ? obj : obj.id;
  }

  private resolvePlanType(subscription: Stripe.Subscription): PlanType {
    const priceId = subscription.items.data[0]?.price?.id;
    if (priceId === this.premiumPriceId) return PlanType.PREMIUM;
    if (priceId === this.proPriceId) return PlanType.PRO;
    return PlanType.FREE;
  }
}
