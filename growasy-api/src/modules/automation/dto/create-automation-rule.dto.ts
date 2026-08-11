import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { TriggerMatchType, AutomationStatus } from '@prisma/client';

/** Trigger sources the engine currently supports (a rule may use one or many). */
export const SUPPORTED_TRIGGER_TYPES = [
  'COMMENT_KEYWORD',
  'DM_KEYWORD',
  'STORY_REPLY',
  // Someone reshared our content to their story and tagged us. No text, so the
  // mention itself is the trigger — keywords don't apply.
  'STORY_MENTION',
] as const;
export type SupportedTriggerType = (typeof SUPPORTED_TRIGGER_TYPES)[number];

export class CreateAutomationRuleDto {
  @ApiProperty({ description: 'Which connected Instagram account this rule runs on' })
  @IsString()
  instagramAccountId: string;

  @ApiProperty({ example: 'Price replies' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({
    isArray: true,
    enum: SUPPORTED_TRIGGER_TYPES,
    default: ['COMMENT_KEYWORD'],
    description: 'One or more trigger sources: post/reel comment, direct message, story reply',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(SUPPORTED_TRIGGER_TYPES, { each: true })
  triggerTypes?: SupportedTriggerType[];

  @ApiProperty({
    enum: TriggerMatchType,
    default: TriggerMatchType.CONTAINS,
    description: 'How comment text is matched against keywords. ANY needs no keywords.',
  })
  @IsOptional()
  @IsEnum(TriggerMatchType)
  matchType?: TriggerMatchType;

  @ApiProperty({ type: [String], example: ['price', 'link', 'info'] })
  @IsOptional()
  @ValidateIf((o) => o.matchType !== TriggerMatchType.ANY)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  keywords?: string[];

  @ApiProperty({ example: 'Hey {{username}}! Here is the link you asked for: https://…' })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  dmText: string;

  @ApiPropertyOptional({
    type: [String],
    description:
      'Alternative wordings of the DM. With any present the rule A/B tests: each ' +
      'send picks one at random and the result is attributed to it. dmText is ' +
      'always variant A.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3, { message: 'Up to 3 alternatives (4 variants in total)' })
  @IsString({ each: true })
  @MaxLength(1000, { each: true })
  dmVariants?: string[];

  @ApiPropertyOptional({ description: 'Optional public reply posted under the comment' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  replyText?: string;

  /**
   * @deprecated Use `mediaIds`. Still accepted so older clients keep working;
   * when both are sent, `mediaIds` wins.
   */
  @ApiPropertyOptional({
    deprecated: true,
    description: 'Legacy single-post filter. Prefer mediaIds.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  mediaId?: string;

  @ApiPropertyOptional({
    type: [String],
    description:
      'Restrict the rule to comments on these media/post ids. Empty or omitted ' +
      'means every post on the account.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  mediaIds?: string[];

  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  maxDmsPerUserPer24h?: number;

  @ApiPropertyOptional({
    default: false,
    description:
      'Turn the DM into a lead-capture flow: after the DM is sent, the contact’s ' +
      'next reply is parsed as an email and saved to their contact record.',
  })
  @IsOptional()
  @IsBoolean()
  collectEmail?: boolean;

  @ApiPropertyOptional({
    description: 'DM sent back once a valid email is captured (lead-capture flow)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  emailSuccessMessage?: string;

  @ApiPropertyOptional({
    description: 'DM sent when the reply is not a valid email, prompting a retry',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  emailFailureMessage?: string;

  @ApiPropertyOptional({ enum: AutomationStatus, default: AutomationStatus.ACTIVE })
  @IsOptional()
  @IsEnum(AutomationStatus)
  status?: AutomationStatus;
}
