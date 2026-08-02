import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { OrgPlanTier } from '@prisma/client';

const PURCHASABLE = [OrgPlanTier.STARTER, OrgPlanTier.GROWTH, OrgPlanTier.PROFESSIONAL];

export class CheckoutDto {
  @ApiProperty({ enum: PURCHASABLE })
  @IsIn(PURCHASABLE)
  plan: OrgPlanTier;

  @ApiProperty({ enum: ['monthly', 'yearly'] })
  @IsIn(['monthly', 'yearly'])
  cycle: 'monthly' | 'yearly';

  /** Optional discount code. Validated + priced server-side, never trusted from the client. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  couponCode?: string;
}

/** Price preview before paying — same inputs as checkout, no order created. */
export class QuoteDto extends CheckoutDto {}

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
