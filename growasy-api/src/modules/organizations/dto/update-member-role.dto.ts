import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';
import { ASSIGNABLE_ROLES } from './invite-member.dto';

export class UpdateMemberRoleDto {
  @ApiProperty({ enum: ASSIGNABLE_ROLES })
  @IsString()
  @IsIn(ASSIGNABLE_ROLES as unknown as string[])
  roleSlug: string;
}
