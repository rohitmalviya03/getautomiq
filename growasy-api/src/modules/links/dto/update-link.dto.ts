import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

/** Slug is immutable after creation (it's the public URL) — not editable here. */
export class UpdateLinkDto {
  @ApiPropertyOptional({ example: 'https://mystore.com/new-destination' })
  @IsOptional()
  @IsUrl({ require_protocol: true }, { message: 'Enter a valid URL including https://' })
  @MaxLength(2048)
  destinationUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({ description: 'Pause a link (paused links stop redirecting)' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
