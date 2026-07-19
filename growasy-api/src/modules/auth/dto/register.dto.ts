import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { OrgPlanTier } from '@prisma/client';

/** Plans a new signup can pick from the pricing page (Agency is not self-serve yet). */
export const SELECTABLE_PLANS = [
  OrgPlanTier.FREE,
  OrgPlanTier.STARTER,
  OrgPlanTier.GROWTH,
] as const;

export class RegisterDto {
  @ApiProperty({ example: 'jane@acme.com' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ example: 'S3curePass!', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(/^(?=.*[a-zA-Z])(?=.*\d).+$/, {
    message: 'Password must contain at least one letter and one number',
  })
  password: string;

  @ApiProperty({ example: 'Jane' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName: string;

  @ApiPropertyOptional({
    example: "Jane's Workspace",
    description: 'Defaults to "<FirstName>\'s Workspace"',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  organizationName?: string;

  @ApiPropertyOptional({
    enum: SELECTABLE_PLANS,
    default: OrgPlanTier.FREE,
    description: 'Plan chosen on the pricing page. Defaults to Free.',
  })
  @IsOptional()
  @IsEnum(OrgPlanTier)
  plan?: OrgPlanTier;
}
