import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiPropertyOptional({
    description:
      'Only needed for non-browser clients; browsers rely on the httpOnly refresh cookie',
  })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
