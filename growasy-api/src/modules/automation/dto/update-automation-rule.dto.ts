import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { AutomationStatus } from '@prisma/client';
import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateAutomationRuleDto } from './create-automation-rule.dto';

/**
 * All create fields optional except the account (which can't move). Most edits
 * are keyword/text tweaks and toggling status ACTIVE/PAUSED.
 */
export class UpdateAutomationRuleDto extends PartialType(
  OmitType(CreateAutomationRuleDto, ['instagramAccountId'] as const),
) {
  @ApiPropertyOptional({ enum: AutomationStatus })
  @IsOptional()
  @IsEnum(AutomationStatus)
  status?: AutomationStatus;
}
