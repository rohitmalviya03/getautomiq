import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, IsString, MaxLength } from 'class-validator';
import { SYSTEM_ROLES } from '../../../common/constants/permissions.constant';

/** Roles a member can be invited as — everything except Owner (there's one owner). */
export const ASSIGNABLE_ROLES = [
  SYSTEM_ROLES.ADMIN,
  SYSTEM_ROLES.EDITOR,
  SYSTEM_ROLES.VIEWER,
] as const;

export class InviteMemberDto {
  @ApiProperty({ example: 'teammate@acme.com' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ enum: ASSIGNABLE_ROLES, example: SYSTEM_ROLES.EDITOR })
  @IsString()
  @IsIn(ASSIGNABLE_ROLES as unknown as string[])
  roleSlug: string;
}
