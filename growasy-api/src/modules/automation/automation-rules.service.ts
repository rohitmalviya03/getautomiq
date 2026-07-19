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
        mediaId: dto.mediaId,
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
      if (
        existing.triggers.length > 0 &&
        (dto.keywords || dto.matchType || dto.mediaId !== undefined || dto.maxDmsPerUserPer24h)
      ) {
        await tx.automationTrigger.updateMany({
          where: { automationRuleId: ruleId },
          data: {
            matchType: dto.matchType ?? undefined,
            keywords: dto.keywords ? JSON.stringify(dto.keywords) : undefined,
            config: JSON.stringify({
              mediaId: dto.mediaId,
              maxDmsPerUserPer24h: dto.maxDmsPerUserPer24h,
            }),
          },
        });
      }

      // Any lead-capture / DM-text edit rewrites the SEND_DM config, merging with
      // the existing config so untouched fields (e.g. text when only the toggle
      // changed) are preserved.
      const wantsDmUpdate =
        dto.dmText !== undefined ||
        dto.collectEmail !== undefined ||
        dto.emailSuccessMessage !== undefined ||
        dto.emailFailureMessage !== undefined;
      if (wantsDmUpdate) {
        const dmAction = existing.actions.find((a) => a.type === 'SEND_DM');
        if (dmAction) {
          const prev = this.parse<DmConfig>(dmAction.config) ?? {};
          await tx.automationAction.update({
            where: { id: dmAction.id },
            data: {
              config: this.buildDmConfig({
                text: dto.dmText ?? prev.text ?? '',
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
    const config = this.parse<{ mediaId?: string; maxDmsPerUserPer24h?: number }>(trigger?.config);
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
      replyText: replyAction
        ? (this.parse<{ text?: string }>(replyAction.config)?.text ?? null)
        : null,
      mediaId: config?.mediaId ?? null,
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
  private buildDmConfig(input: DmConfig): string {
    const config: DmConfig = { text: input.text ?? '', collectEmail: input.collectEmail ?? false };
    if (input.emailSuccessMessage) config.emailSuccessMessage = input.emailSuccessMessage;
    if (input.emailFailureMessage) config.emailFailureMessage = input.emailFailureMessage;
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
  collectEmail?: boolean;
  emailSuccessMessage?: string;
  emailFailureMessage?: string;
}

type RuleWithRelations = Prisma.AutomationRuleGetPayload<{
  include: { triggers: true; actions: true; _count: { select: { executionLogs: true } } };
}>;
