import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class OAuthCallbackDto {
  @ApiProperty({ description: 'The ?code= value Meta appended to the redirect URI' })
  @IsString()
  @MaxLength(1024)
  code: string;

  @ApiProperty({ description: 'The ?state= value from the same redirect (CSRF check)' })
  @IsString()
  @MaxLength(2048)
  state: string;
}
