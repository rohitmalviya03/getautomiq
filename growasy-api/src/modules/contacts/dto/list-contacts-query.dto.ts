import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class ListContactsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Only contacts belonging to this Instagram account' })
  @IsOptional()
  @IsString()
  instagramAccountId?: string;

  @ApiPropertyOptional({ description: 'Free-text match on username / name / email' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;
}
