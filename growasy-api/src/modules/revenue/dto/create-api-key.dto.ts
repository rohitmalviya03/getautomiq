import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class CreateApiKeyDto {
  @ApiProperty({ description: 'Label so you can tell your keys apart, e.g. "Shopify store"' })
  @IsString()
  @Length(1, 100)
  name!: string;
}
