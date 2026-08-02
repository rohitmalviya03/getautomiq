import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { DiscountType, OrgPlanTier } from '@prisma/client';

/**
 * Patch a plan. Every field is optional — only what's sent is written, so the
 * console can save one section at a time. Prices are in paise (₹499 = 49900).
 */
export class UpdatePlanDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ description: 'Monthly price in paise (₹499 = 49900).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  monthlyPrice?: number;

  @ApiPropertyOptional({ description: 'Yearly price in paise.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  yearlyPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  // ---- Storefront copy ------------------------------------------------------

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  tag?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  subtitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  ctaLabel?: string;

  @ApiPropertyOptional({ description: '"Everything in Starter, plus:" lead line.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  inheritsLabel?: string;

  @ApiPropertyOptional({ type: [String], description: 'Marketing bullets shown on the pricing cards.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(160, { each: true })
  features?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPopular?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isBestValue?: boolean;

  @ApiPropertyOptional({ description: 'Sales-led: hides the price, shows Contact Sales.' })
  @IsOptional()
  @IsBoolean()
  contactSales?: boolean;

  @ApiPropertyOptional({ description: 'Listed on the public pricing pages.' })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(999)
  sortOrder?: number;

  // ---- Limits (enforced by PlanLimitsService) -------------------------------

  @ApiPropertyOptional({ description: '-1 = unlimited.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-1)
  maxInstagramAccounts?: number;

  @ApiPropertyOptional({ description: '-1 = unlimited.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-1)
  maxAutomations?: number;

  @ApiPropertyOptional({ description: 'DMs per billing period. -1 = unlimited.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-1)
  maxMessagesPerMonth?: number;

  @ApiPropertyOptional({ description: '-1 = unlimited.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-1)
  maxContacts?: number;

  @ApiPropertyOptional({ description: '-1 = unlimited.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-1)
  maxTeamMembers?: number;

  @ApiPropertyOptional({ description: 'Whether the AI DM Agent is enabled on this plan.' })
  @IsOptional()
  @IsBoolean()
  aiAgent?: boolean;

  // ---- Always-on promo ------------------------------------------------------

  @ApiPropertyOptional({ enum: DiscountType, description: 'null clears the promo.' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsEnum(DiscountType)
  promoType?: DiscountType | null;

  @ApiPropertyOptional({ description: 'PERCENT: 1-100 · FLAT: paise.' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  promoValue?: number | null;

  @ApiPropertyOptional({ description: 'Badge text, e.g. "Launch offer".' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  promoLabel?: string | null;

  @ApiPropertyOptional({ description: 'ISO date. Empty string clears it.' })
  @IsOptional()
  @IsString()
  promoStartsAt?: string | null;

  @ApiPropertyOptional({ description: 'ISO date. Empty string clears it.' })
  @IsOptional()
  @IsString()
  promoEndsAt?: string | null;

  @ApiPropertyOptional({ description: 'Reason, recorded in the audit log.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/** Create or patch a coupon. `code` is required on create and immutable after. */
export class UpsertCouponDto {
  @ApiPropertyOptional({ description: 'Stored upper-cased. Required on create.' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiPropertyOptional({ enum: DiscountType })
  @IsOptional()
  @IsEnum(DiscountType)
  type?: DiscountType;

  @ApiPropertyOptional({ description: 'PERCENT: 1-100 · FLAT: paise.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  value?: number;

  @ApiPropertyOptional({ enum: OrgPlanTier, isArray: true, description: 'Empty = every purchasable tier.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsEnum(OrgPlanTier, { each: true })
  appliesToTiers?: OrgPlanTier[];

  @ApiPropertyOptional({ description: 'Empty = both cycles.', example: ['monthly'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @IsIn(['monthly', 'yearly'], { each: true })
  appliesToCycles?: ('monthly' | 'yearly')[];

  @ApiPropertyOptional({ description: 'Global redemption cap. null = unlimited.' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxRedemptions?: number | null;

  @ApiPropertyOptional({ description: 'Per-organization cap. 0 = unlimited.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  maxPerOrg?: number;

  @ApiPropertyOptional({ description: 'ISO date. Empty string clears it.' })
  @IsOptional()
  @IsString()
  startsAt?: string | null;

  @ApiPropertyOptional({ description: 'ISO date. Empty string clears it.' })
  @IsOptional()
  @IsString()
  endsAt?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Reason, recorded in the audit log.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
