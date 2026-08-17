import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { OrgPlanTier, SubscriptionStatus, BillingCycle } from '@prisma/client';

/** Offset pagination + free-text search — fine at admin/back-office scale. */
export class AdminListQueryDto {
  @ApiPropertyOptional({ description: 'Free-text search (name / slug / owner email)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 25, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 25;
}

/** Owner override of a customer's subscription. All fields optional — patch semantics. */
export class ChangePlanDto {
  @ApiPropertyOptional({ enum: OrgPlanTier })
  @IsOptional()
  @IsEnum(OrgPlanTier)
  tier?: OrgPlanTier;

  @ApiPropertyOptional({ enum: BillingCycle })
  @IsOptional()
  @IsEnum(BillingCycle)
  billingCycle?: BillingCycle;

  @ApiPropertyOptional({ enum: SubscriptionStatus })
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;

  @ApiPropertyOptional({ description: 'ISO date; sets/extends the trial end. Empty string clears it.' })
  @IsOptional()
  @IsString()
  trialEndsAt?: string;

  @ApiPropertyOptional({ description: 'Cancel at the end of the current period instead of immediately.' })
  @IsOptional()
  @IsBoolean()
  cancelAtPeriodEnd?: boolean;

  @ApiPropertyOptional({ description: 'Reason, recorded in the audit log.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/** Suspend / reactivate an organization or user. */
export class SetActiveDto {
  @ApiPropertyOptional({ description: 'Reason, recorded in the audit log.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/** Promote/demote a user to super-admin. */
export class SetSuperAdminDto {
  @IsBoolean()
  isSuperAdmin!: boolean;

  @ApiPropertyOptional({ description: 'Reason, recorded in the audit log.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/** Reset a customer's monthly DM counter, or grant them bonus headroom. */
export class AdjustUsageDto {
  @ApiProperty({ enum: ['reset', 'grant'] })
  @IsIn(['reset', 'grant'])
  action!: 'reset' | 'grant';

  @ApiPropertyOptional({ description: 'For "grant": number of bonus DMs to free up this period.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  amount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/** Comp a paid plan free for a fixed number of days. */
export class CompPlanDto {
  @ApiProperty({ enum: OrgPlanTier })
  @IsEnum(OrgPlanTier)
  tier!: OrgPlanTier;

  @ApiProperty({ description: 'How many days the comp lasts.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  days!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/** Send an in-app notification to a customer's owner. */
/** A message an admin writes to a customer. Plain text — the email template
 *  escapes the body, so markup is never interpreted. */
export class EmailCustomerDto {
  @ApiProperty({ description: 'Subject line the customer sees in their inbox' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  subject!: string;

  @ApiProperty({ description: 'Message body. Blank lines become paragraphs.' })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;
}

export class NotifyCustomerDto {
  @ApiProperty()
  @IsString()
  @MaxLength(255)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  body?: string;
}
