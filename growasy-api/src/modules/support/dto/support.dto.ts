import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { SupportCategory, SupportTicketPriority, SupportTicketStatus } from '@prisma/client';

export class CreateTicketDto {
  @ApiProperty({ description: 'One-line summary of the problem' })
  @IsString()
  @MinLength(3, { message: 'Give your ticket a short subject' })
  @MaxLength(255)
  subject!: string;

  @ApiProperty({ description: 'The full description — becomes the first message' })
  @IsString()
  @MinLength(10, { message: 'Please describe the issue in a little more detail' })
  @MaxLength(5000)
  message!: string;

  @ApiPropertyOptional({ enum: SupportCategory, default: SupportCategory.OTHER })
  @IsOptional()
  @IsEnum(SupportCategory)
  category?: SupportCategory;

  @ApiPropertyOptional({ description: 'Reply-to address. Defaults to the account email.' })
  @IsOptional()
  @ValidateIf((_, v) => v !== '' && v !== null)
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(255)
  contactEmail?: string;

  @ApiPropertyOptional({ description: 'Optional phone/WhatsApp number for a callback.' })
  @IsOptional()
  @ValidateIf((_, v) => v !== '' && v !== null)
  // Digits, spaces and the usual separators — deliberately loose so international
  // formats aren't rejected; this is a contact hint, not a dialled number.
  @Matches(/^[+\d][\d\s()-]{5,20}$/, { message: 'Enter a valid phone number' })
  @MaxLength(32)
  contactPhone?: string;
}

export class ReplyTicketDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  message!: string;
}

/** Admin-only reply: may be an internal note the customer never sees. */
export class AdminReplyTicketDto extends ReplyTicketDto {
  @ApiPropertyOptional({
    default: false,
    description: 'Internal note — stored on the ticket but hidden from the customer.',
  })
  @IsOptional()
  isInternal?: boolean;
}

export class UpdateTicketDto {
  @ApiPropertyOptional({ enum: SupportTicketStatus })
  @IsOptional()
  @IsEnum(SupportTicketStatus)
  status?: SupportTicketStatus;

  @ApiPropertyOptional({ enum: SupportTicketPriority })
  @IsOptional()
  @IsEnum(SupportTicketPriority)
  priority?: SupportTicketPriority;

  @ApiPropertyOptional({ description: 'Super-admin user id to own this ticket. Empty string unassigns.' })
  @IsOptional()
  @IsString()
  assignedToUserId?: string;
}

export class TicketListQueryDto {
  @ApiPropertyOptional({ enum: SupportTicketStatus })
  @IsOptional()
  @IsEnum(SupportTicketStatus)
  status?: SupportTicketStatus;

  @ApiPropertyOptional({ enum: SupportCategory })
  @IsOptional()
  @IsEnum(SupportCategory)
  category?: SupportCategory;

  @ApiPropertyOptional({ description: 'Search subject or requester email' })
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
