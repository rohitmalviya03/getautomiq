import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateLinkDto {
  @ApiProperty({ example: 'https://mystore.com/summer-sale', description: 'Where clicks go' })
  @IsUrl({ require_protocol: true }, { message: 'Enter a valid URL including https://' })
  @MaxLength(2048)
  destinationUrl: string;

  @ApiPropertyOptional({ example: 'Summer sale landing page' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({
    example: 'summer',
    description: 'Custom short code (3–32 chars: letters, numbers, - and _). Auto-generated if omitted.',
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: 'Slug may only contain letters, numbers, hyphens and underscores',
  })
  slug?: string;

  @ApiPropertyOptional({ description: 'Attribute the link to one connected Instagram account' })
  @IsOptional()
  @IsString()
  instagramAccountId?: string;
}
