import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlanType } from '@prisma/client';
import { PLAN_KEY } from '../decorators/require-plan.decorator';

const PLAN_RANK: Record<PlanType, number> = {
  FREE: 0,
  PRO: 1,
  PREMIUM: 2,
};

@Injectable()
export class PlanGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<PlanType>(PLAN_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No plan requirement set — allow through
    if (!required) return true;

    const { user } = context.switchToHttp().getRequest();
    const userRank = PLAN_RANK[user?.planType as PlanType] ?? 0;
    const requiredRank = PLAN_RANK[required];

    if (userRank < requiredRank) {
      throw new ForbiddenException(`Upgrade to ${required} to access this feature`);
    }

    return true;
  }
}
