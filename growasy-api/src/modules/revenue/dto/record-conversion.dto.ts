import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

/**
 * A sale reported by the creator's storefront. At least one of `email`,
 * `contactId` or `linkSlug` should be present — without one the sale is still
 * recorded, just as unattributed revenue.
 */
export class RecordConversionDto {
  @ApiProperty({ description: 'Sale amount in minor units (paise for INR, cents for USD)' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  // A hundred crore rupees in paise. Far past any real sale, and it stops a
  // stray "amount in rupees ×100 ×100" bug from poisoning every total.
  @Max(100_000_000_000)
  value!: number;

  @ApiPropertyOptional({ default: 'INR' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter ISO code, e.g. INR' })
  currency?: string;

  @ApiPropertyOptional({
    description: 'Order id in your own system. Send it, and retries will not double-count the sale.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  externalId?: string;

  @ApiPropertyOptional({ description: "The buyer's email — how most sales get matched to a lead" })
  @IsOptional()
  @IsEmail()
  @Length(1, 255)
  email?: string;

  @ApiPropertyOptional({ description: 'Automiq contact id, if you already know it' })
  @IsOptional()
  @IsString()
  @Length(1, 36)
  contactId?: string;

  @ApiPropertyOptional({ description: 'Slug of the tracked link the buyer arrived through' })
  @IsOptional()
  @IsString()
  @Length(1, 32)
  linkSlug?: string;

  @ApiPropertyOptional({ description: 'When the sale happened (ISO 8601). Defaults to now.' })
  @IsOptional()
  @IsISO8601()
  occurredAt?: string;
}
