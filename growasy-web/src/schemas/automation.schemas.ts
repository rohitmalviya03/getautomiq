import { z } from 'zod';

/**
 * Form schema for the comment → DM automation builder. All fields are strings
 * here (the form works in strings); the page maps them to the API payload
 * (keywords split to an array, numbers coerced, blanks dropped) on submit.
 * Mirrors the backend's class-validator rules on CreateAutomationRuleDto.
 */
export const automationRuleSchema = z
  .object({
    instagramAccountId: z.string().min(1, 'Choose an Instagram account'),
    name: z.string().min(1, 'Give this automation a name').max(255),
    triggerTypes: z
      .array(z.enum(['COMMENT_KEYWORD', 'DM_KEYWORD', 'STORY_REPLY', 'STORY_MENTION']))
      .min(1, 'Pick at least one trigger source'),
    matchType: z.enum(['CONTAINS', 'EXACT', 'STARTS_WITH', 'ANY', 'REGEX']),
    keywords: z.string().max(2000).optional().default(''),
    dmText: z.string().min(1, 'Write the DM to send').max(1000),
    /** Alternative wordings, one per line. Blank lines are dropped on submit. */
    dmVariants: z.string().max(3000).optional().default(''),
    replyText: z.string().max(1000).optional().default(''),
    /** Posts/reels the rule is limited to. Empty = every post on the account. */
    mediaIds: z.array(z.string().max(64)).max(100).optional().default([]),
    collectEmail: z.boolean().optional().default(false),
    emailSuccessMessage: z.string().max(1000).optional().default(''),
    emailFailureMessage: z.string().max(1000).optional().default(''),
    maxDmsPerUserPer24h: z
      .string()
      .optional()
      .default('')
      .refine((v) => v === '' || (/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 50), {
        message: 'Enter a whole number between 1 and 50',
      }),
    status: z.enum(['ACTIVE', 'PAUSED']),
  })
  .refine((v) => v.matchType === 'ANY' || v.keywords.trim().length > 0, {
    message: 'Add at least one keyword (comma-separated)',
    path: ['keywords'],
  })
  .refine((v) => !v.collectEmail || v.emailSuccessMessage.trim().length > 0, {
    message: 'Add the confirmation DM sent after an email is captured',
    path: ['emailSuccessMessage'],
  });

export type AutomationFormValues = z.infer<typeof automationRuleSchema>;
