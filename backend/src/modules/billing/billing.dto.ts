import { IsIn } from 'class-validator';
import { PlanType } from '@prisma/client';

export class CreateCheckoutDto {
  @IsIn([PlanType.PRO, PlanType.PREMIUM])
  plan: PlanType.PRO | PlanType.PREMIUM;
}
