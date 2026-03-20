import { IsIn } from 'class-validator';

export class CreateCheckoutDto {
  @IsIn(['PRO', 'PREMIUM'])
  plan: 'PRO' | 'PREMIUM';
}
