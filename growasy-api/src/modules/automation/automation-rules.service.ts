import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TriggerType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { CreateAutomationRuleDto } from './dto/create-automation-rule.dto';
import { UpdateAutomationRuleDto } from './dto/update-automation-rule.dto';
import { PLAN_FEATURES } from '../../common/constants/plan-features.constant';

/** Shape of the JSON in AutomationTrigger.config. */
interface TriggerConfig {
  /** @deprecated Single-post filter written by older versions. Read, never written. */
  mediaId?: string;
  /** Posts this rule is limited to. Empty/absent = every post on the account. */
  mediaIds?: string[];
  maxDmsPerUserPer24h?: number;
}

/**
 * The rule's media filter as a list, accepting either shape.
 *
 * Rules created before multi-post support carry `mediaId` as a single string,
 * and they are still live in production — reading both keys is what stops those
 * automations from silently widening to "all posts" after this change.
 */
export function mediaFilterOf(config: TriggerConfig | null | undefined): string[] {
  if (!config) return [];
  if (Array.isArray(config.mediaIds) && config.mediaIds.length > 0) return config.mediaIds;
  return config.mediaId ? [config.mediaId] : [];
}

/** Trims, drops blanks and de-duplicates a media id list. */
function normalizeMediaIds(dto: { mediaIds?: string[]; mediaId?: string }): string[] {
  const raw = dto.mediaIds ?? (dto.mediaId ? [dto.mediaId] : []);
  return [...new Set(raw.map((id) => id.trim()).filter(Boolean))];
}

/**
 * CRUD for comment → DM automation rules. A "rule" is stored as an AutomationRule
 * plus one COMMENT_KEYWORD trigger and one/two actions (SEND_DM, optional
 * REPLY_COMMENT). This service hides that shape behind a flat DTO.
 */
@Injectable()
export class AutomationRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planLimits: PlanLimitsService,
  ) {}

  async create(organizationId: string, dto: CreateAutomationRuleDto) {
    await this.assertAccountInOrg(organizationId, dto.instagramAccountId);

    // Only ACTIVE rules count against the plan's active-automation limit.
    if ((dto.status ?? 'ACTIVE') === 'ACTIVE') {
      await this.planLimits.assertCanCreateActiveRule(organizationId);
    }

    await this.assertCanUseVariants(organizationId, dto.dmVariants);

    const rule = await this.prisma.$transaction(async (tx) => {
      const created = await tx.automationRule.create({
        data: {
          organizationId,
          instagramAccountId: dto.instagramAccountId,
          name: dto.name,
          status: dto.status ?? 'ACTIVE',
        },
      });

      // One trigger row per selected source; they share keywords/matchType/config.
      const triggerTypes: TriggerType[] =
        dto.triggerTypes && dto.triggerTypes.length > 0 ? dto.triggerTypes : ['COMMENT_KEYWORD'];
      const triggerConfig = JSON.stringify({
        mediaIds: normalizeMediaIds(dto),
        maxDmsPerUserPer24h: dto.maxDmsPerUserPer24h,
      });
      await tx.automationTrigger.createMany({
        data: triggerTypes.map((type) => ({
          automationRuleId: created.id,
          type,
          matchType: dto.matchType,
          keywords: JSON.stringify(dto.keywords ?? []),
          config: triggerConfig,
        })),
      });

      await tx.automationAction.create({
        data: {
          automationRuleId: created.id,
          type: 'SEND_DM',
          order: 0,
          config: this.buildDmConfig({
            text: dto.dmText,
            variants: dto.dmVariants ?? [],
            collectEmail: dto.collectEmail ?? false,
            emailSuccessMessage: dto.emailSuccessMessage,
            emailFailureMessage: dto.emailFailureMessage,
          }),
        },
      });

      if (dto.replyText) {
        await tx.automationAction.create({
          data: {
            automationRuleId: created.id,
            type: 'REPLY_COMMENT',
            order: 1,
            config: JSON.stringify({ text: dto.replyText }),
          },
        });
      }

      return created;
    });

    return this.findById(organizationId, rule.id);
  }

  async list(organizationId: string, instagramAccountId?: string) {
    const rules = await this.prisma.automationRule.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(instagramAccountId ? { instagramAccountId } : {}),
      },
      include: {
        triggers: true,
        actions: { orderBy: { order: 'asc' } },
        _count: { select: { executionLogs: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rules.map((rule) => this.toView(rule));
  }

  async findById(organizationId: string, ruleId: string) {
    const rule = await this.prisma.automationRule.findFirst({
      where: { id: ruleId, organizationId, deletedAt: null },
      include: {
        triggers: true,
        actions: { orderBy: { order: 'asc' } },
        _count: { select: { executionLogs: true } },
      },
    });
    if (!rule) {
      throw new NotFoundException('Automation rule not found');
    }
    return this.toView(rule);
  }

  async update(organizationId: string, ruleId: string, dto: UpdateAutomationRuleDto) {
    const existing = await this.prisma.automationRule.findFirst({
      where: { id: ruleId, organizationId, deletedAt: null },
      include: { triggers: true, actions: true },
    });
    if (!existing) {
      throw new NotFoundException('Automation rule not found');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.automationRule.update({
        where: { id: ruleId },
        data: {
          name: dto.name ?? undefined,
          status: dto.status ?? undefined,
        },
      });

      // Keyword/match/config edits apply to ALL of the rule's triggers (they're
      // kept in sync — the trigger types themselves are fixed after creation).
      const touchesMedia = dto.mediaIds !== undefined || dto.mediaId !== undefined;
      if (
        existing.triggers.length > 0 &&
        (dto.keywords || dto.matchType || touchesMedia || dto.maxDmsPerUserPer24h)
      ) {
        // Merge into the current config rather than rebuilding it from the DTO.
        // These are PATCH semantics: rewriting wholesale meant an edit that only
        // touched keywords silently cleared the post filter and the DM cap.
        const current = this.parse<TriggerConfig>(existing.triggers[0]?.config ?? null) ?? {};
        const nextConfig: TriggerConfig = {
          mediaIds: touchesMedia ? normalizeMediaIds(dto) : mediaFilterOf(current),
          maxDmsPerUserPer24h: dto.maxDmsPerUserPer24h ?? current.maxDmsPerUserPer24h,
        };
        await tx.automationTrigger.updateMany({
          where: { automationRuleId: ruleId },
          data: {
            matchType: dto.matchType ?? undefined,
            keywords: dto.keywords ? JSON.stringify(dto.keywords) : undefined,
            config: JSON.stringify(nextConfig),
          },
        });
      }

      // Any lead-capture / DM-text edit rewrites the SEND_DM config, merging with
      // the existing config so untouched fields (e.g. text when only the toggle
      // changed) are preserved.
      const wantsDmUpdate =
        dto.dmText !== undefined ||
        dto.dmVariants !== undefined ||
        dto.collectEmail !== undefined ||
        dto.emailSuccessMessage !== undefined ||
        dto.emailFailureMessage !== undefined;
      if (wantsDmUpdate) {
        await this.assertCanUseVariants(organizationId, dto.dmVariants);
        const dmAction = existing.actions.find((a) => a.type === 'SEND_DM');
        if (dmAction) {
          const prev = this.parse<DmConfig>(dmAction.config) ?? {};
          await tx.automationAction.update({
            where: { id: dmAction.id },
            data: {
              config: this.buildDmConfig({
                text: dto.dmText ?? prev.text ?? '',
                variants: dto.dmVariants ?? prev.variants ?? [],
                collectEmail: dto.collectEmail ?? prev.collectEmail ?? false,
                emailSuccessMessage: dto.emailSuccessMessage ?? prev.emailSuccessMessage,
                emailFailureMessage: dto.emailFailureMessage ?? prev.emailFailureMessage,
              }),
            },
          });
        }
      }

      if (dto.replyText !== undefined) {
        const replyAction = existing.actions.find((a) => a.type === 'REPLY_COMMENT');
        if (dto.replyText && replyAction) {
          await tx.automationAction.update({
            where: { id: replyAction.id },
            data: { config: JSON.stringify({ text: dto.replyText }) },
          });
        } else if (dto.replyText && !replyAction) {
          await tx.automationAction.create({
            data: {
              automationRuleId: ruleId,
              type: 'REPLY_COMMENT',
              order: 1,
              config: JSON.stringify({ text: dto.replyText }),
            },
          });
        } else if (!dto.replyText && replyAction) {
          await tx.automationAction.delete({ where: { id: replyAction.id } });
        }
      }
    });

    return this.findById(organizationId, ruleId);
  }

  async remove(organizationId: string, ruleId: string) {
    const rule = await this.prisma.automationRule.findFirst({
      where: { id: ruleId, organizationId, deletedAt: null },
    });
    if (!rule) {
      throw new NotFoundException('Automation rule not found');
    }
    await this.prisma.automationRule.update({
      where: { id: ruleId },
      data: { status: 'ARCHIVED', deletedAt: new Date() },
    });
  }

  /**
   * Recent automation activity for the org — a user-facing feed of what the
   * engine did (matched, DM sent, rate-limited, etc.), enriched with the rule
   * name and the contact's username. Reads the ProcessedComment ledger.
   */
  async listActivity(organizationId: string, limit = 30) {
    const accounts = await this.prisma.instagramAccount.findMany({
      where: { organizationId, deletedAt: null },
      select: { id: true },
    });
    const accountIds = accounts.map((a) => a.id);
    if (accountIds.length === 0) return [];

    const events = await this.prisma.processedComment.findMany({
      where: { instagramAccountId: { in: accountIds } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
    });
    if (events.length === 0) return [];

    const ruleIds = [...new Set(events.map((e) => e.ruleId).filter((id): id is string => !!id))];
    const commenterIds = [...new Set(events.map((e) => e.commenterId))];

    const [rules, contacts] = await Promise.all([
      this.prisma.automationRule.findMany({
        where: { id: { in: ruleIds } },
        select: { id: true, name: true },
      }),
      this.prisma.contact.findMany({
        where: { instagramAccountId: { in: accountIds }, instagramScopedId: { in: commenterIds } },
        select: { instagramAccountId: true, instagramScopedId: true, username: true },
      }),
    ]);
    const ruleName = new Map(rules.map((r) => [r.id, r.name]));
    const contactName = new Map(
      contacts.map((c) => [`${c.instagramAccountId}:${c.instagramScopedId}`, c.username]),
    );

    return events.map((e) => ({
      id: e.id,
      outcome: e.outcome,
      dmSent: e.dmSent,
      matched: e.matched,
      source: e.mediaId ? 'comment' : 'message',
      ruleName: e.ruleId ? (ruleName.get(e.ruleId) ?? null) : null,
      contactUsername: contactName.get(`${e.instagramAccountId}:${e.commenterId}`) ?? null,
      createdAt: e.createdAt,
    }));
  }

  private async assertAccountInOrg(organizationId: string, instagramAccountId: string) {
    const account = await this.prisma.instagramAccount.findFirst({
      where: { id: instagramAccountId, organizationId, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!account) {
      throw new ForbiddenException('That Instagram account does not belong to this workspace');
    }
    if (account.status !== 'CONNECTED') {
      throw new BadRequestException('That Instagram account is not connected');
    }
  }

  private toView(rule: RuleWithRelations) {
    const trigger = rule.triggers[0];
    const config = this.parse<TriggerConfig>(trigger?.config);
    const mediaIds = mediaFilterOf(config);
    const dmAction = rule.actions.find((a) => a.type === 'SEND_DM');
    const replyAction = rule.actions.find((a) => a.type === 'REPLY_COMMENT');
    const dmConfig = this.parse<DmConfig>(dmAction?.config ?? null) ?? {};
    return {
      id: rule.id,
      instagramAccountId: rule.instagramAccountId,
      name: rule.name,
      status: rule.status,
      triggerTypes:
        rule.triggers.length > 0 ? rule.triggers.map((t) => t.type) : ['COMMENT_KEYWORD'],
      matchType: trigger?.matchType ?? 'CONTAINS',
      keywords: this.parse<string[]>(trigger?.keywords ?? null) ?? [],
      dmText: dmConfig.text ?? '',
      dmVariants: dmConfig.variants ?? [],
      replyText: replyAction
        ? (this.parse<{ text?: string }>(replyAction.config)?.text ?? null)
        : null,
      mediaIds,
      // Kept so existing clients/analytics that read a single id still work.
      mediaId: mediaIds[0] ?? null,
      maxDmsPerUserPer24h: config?.maxDmsPerUserPer24h ?? null,
      collectEmail: dmConfig.collectEmail ?? false,
      emailSuccessMessage: dmConfig.emailSuccessMessage ?? null,
      emailFailureMessage: dmConfig.emailFailureMessage ?? null,
      triggeredCount: rule._count.executionLogs,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
    };
  }

  /** Serializes the SEND_DM action config, dropping undefined optional fields. */
  /**
   * A/B results for one rule: how each message variant performed.
   *
   * Sends come from the event ledger; captures from completed lead-capture rows,
   * which carry the variant of the DM that opened them. Rules with a single
   * message report no variants at all rather than a meaningless single row.
   */
  async variantStats(organizationId: string, ruleId: string) {
    const rule = await this.prisma.automationRule.findFirst({
      where: { id: ruleId, organizationId, deletedAt: null },
      include: { actions: true },
    });
    if (!rule) throw new NotFoundException('Automation rule not found');

    const dmAction = rule.actions.find((a) => a.type === 'SEND_DM');
    const dmConfig = this.parse<DmConfig>(dmAction?.config ?? null) ?? {};
    const texts = [dmConfig.text ?? '', ...(dmConfig.variants ?? [])].filter(Boolean);
    if (texts.length < 2) return { running: false, variants: [] };

    const [sends, captures] = await Promise.all([
      this.prisma.processedComment.groupBy({
        by: ['variantId'],
        where: { ruleId, dmSent: true },
        _count: { _all: true },
      }),
      this.prisma.pendingLeadCapture.groupBy({
        by: ['variantId'],
        where: { ruleId, status: 'COMPLETED' },
        _count: { _all: true },
      }),
    ]);

    const sendsBy = new Map(sends.map((r) => [r.variantId, r._count._all]));
    const capturesBy = new Map(captures.map((r) => [r.variantId, r._count._all]));

    const variants = texts.map((text, i) => {
      const id = String.fromCharCode(65 + i);
      const sent = sendsBy.get(id) ?? 0;
      const captured = capturesBy.get(id) ?? 0;
      return {
        id,
        text,
        sent,
        captured,
        // Only meaningful once the variant has actually been sent.
        captureRate: sent > 0 ? Number(((captured / sent) * 100).toFixed(1)) : null,
      };
    });

    const totalSent = variants.reduce((n, v) => n + v.sent, 0);
    // A leader off a handful of sends is noise, not a result.
    const ranked = [...variants].filter((v) => v.sent >= 20).sort((a, b) => (b.captureRate ?? 0) - (a.captureRate ?? 0));
    const leader = ranked.length >= 2 && (ranked[0].captureRate ?? 0) > (ranked[1].captureRate ?? 0) ? ranked[0].id : null;

    return { running: true, totalSent, leader, variants };
  }
  /**
   * A/B testing is sold as a Professional feature, so alternative wordings are
   * refused below that tier. Enforced here rather than with @RequireFeature
   * because the route itself stays open to everyone — only the extra messages
   * are withheld, and a rule that already has them keeps running.
   */
  private async assertCanUseVariants(organizationId: string, variants?: string[]) {
    if (!(variants ?? []).some((v) => v.trim().length > 0)) return;

    const unlocked = await this.planLimits.hasFeature(organizationId, PLAN_FEATURES.AB_TESTING);
    if (!unlocked) {
      throw new ForbiddenException({
        error: 'PLAN_FEATURE_LOCKED',
        message: 'A/B testing your DM wording is not included in your current plan.',
      });
    }
  }

  private buildDmConfig(input: DmConfig): string {
    const config: DmConfig = { text: input.text ?? '', collectEmail: input.collectEmail ?? false };
    if (input.emailSuccessMessage) config.emailSuccessMessage = input.emailSuccessMessage;
    if (input.emailFailureMessage) config.emailFailureMessage = input.emailFailureMessage;
    // Blank alternatives are dropped rather than stored — an empty variant would
    // otherwise be picked by a send and deliver an empty DM.
    const variants = (input.variants ?? []).map((v) => v.trim()).filter(Boolean);
    if (variants.length > 0) config.variants = variants;
    return JSON.stringify(config);
  }

  private parse<T>(value: string | null | undefined): T | null {
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }
}

/** Shape stored in a SEND_DM action's config JSON. */
interface DmConfig {
  text?: string;
  /** Alternative wordings. Combined with `text` (variant A) when a send picks one. */
  variants?: string[];
  collectEmail?: boolean;
  emailSuccessMessage?: string;
  emailFailureMessage?: string;
}

type RuleWithRelations = Prisma.AutomationRuleGetPayload<{
  include: { triggers: true; actions: true; _count: { select: { executionLogs: true } } };
}>;
