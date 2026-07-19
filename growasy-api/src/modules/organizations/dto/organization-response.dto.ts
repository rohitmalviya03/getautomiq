import { ApiProperty } from '@nestjs/swagger';

export class OrganizationResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() slug: string;
  @ApiProperty({ required: false, nullable: true }) logoUrl: string | null;
  @ApiProperty() timezone: string;
  @ApiProperty() createdAt: Date;
}
