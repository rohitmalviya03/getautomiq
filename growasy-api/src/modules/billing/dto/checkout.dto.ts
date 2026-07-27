import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';
import { OrgPlanTier } from '@prisma/client';

const PURCHASABLE = [OrgPlanTier.STARTER, OrgPlanTier.GROWTH];

export class CheckoutDto {
  @ApiProperty({ enum: PURCHASABLE })
  @IsIn(PURCHASABLE)
  plan: OrgPlanTier;

  @ApiProperty({ enum: ['monthly', 'yearly'] })
  @IsIn(['monthly', 'yearly'])
  cycle: 'monthly' | 'yearly';
}

export class VerifyPaymentDto {
  @ApiProperty()
  @IsString()
  razorpay_order_id: string;

  @ApiProperty()
  @IsString()
  razorpay_payment_id: string;

  @ApiProperty()
  @IsString()
  razorpay_signature: string;

  @ApiProperty({ enum: PURCHASABLE })
  @IsIn(PURCHASABLE)
  plan: OrgPlanTier;

  @ApiProperty({ enum: ['monthly', 'yearly'] })
  @IsIn(['monthly', 'yearly'])
  cycle: 'monthly' | 'yearly';
}
