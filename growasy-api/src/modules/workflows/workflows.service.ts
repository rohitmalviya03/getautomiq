import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WorkflowNodeType, WorkflowStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateWorkflowDto,
  SaveGraphDto,
  UpdateWorkflowDto,
  WorkflowNodeInput,
} from './dto/workflow.dto';

function parse<T>(value: string | null | undefined): T | Record<string, never> {
  if (!value) return {};
  try {
    return JSON.parse(value) as T;
  } catch {
    return {};
  }
}

@Injectable()
export class WorkflowsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertAccount(organizationId: string, instagramAccountId: string) {
    const acc = await this.prisma.instagramAccount.findFirst({
      where: { id: instagramAccountId, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!acc) throw new BadRequestException('Instagram account not found in this workspace');
  }

  private async getOwned(organizationId: string, id: string) {
    const wf = await this.prisma.workflow.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!wf) throw new NotFoundException('Workflow not found');
    return wf;
  }

  async create(organizationId: string, dto: CreateWorkflowDto) {
    await this.assertAccount(organizationId, dto.instagramAccountId);

    // Seed a minimal, publishable starter graph: Trigger → End.
    const triggerId = randomUUID();
    const endId = randomUUID();

    const workflow = await this.prisma.workflow.create({
      data: {
        organizationId,
        instagramAccountId: dto.instagramAccountId,
        name: dto.name,
        description: dto.description ?? null,
        status: WorkflowStatus.DRAFT,
        nodes: {
          create: [
            {
              id: triggerId,
              type: WorkflowNodeType.TRIGGER,
              config: JSON.stringify({ triggerType: 'DM_KEYWORD', matchType: 'CONTAINS', keywords: [] }),
              positionX: 80,
              positionY: 160,
            },
            {
              id: endId,
              type: WorkflowNodeType.END,
              config: JSON.stringify({}),
              positionX: 520,
              positionY: 160,
            },
          ],
        },
        edges: { create: [{ sourceNodeId: triggerId, targetNodeId: endId }] },
      },
    });
    return this.findById(organizationId, workflow.id);
  }

  async list(organizationId: string, instagramAccountId?: string) {
    const workflows = await this.prisma.workflow.findMany({
      where: { organizationId, deletedAt: null, ...(instagramAccountId ? { instagramAccountId } : {}) },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        priority: true,
        version: true,
        instagramAccountId: true,
        updatedAt: true,
        createdAt: true,
        instagramAccount: { select: { username: true } },
        _count: { select: { nodes: true, runs: true } },
      },
    });
    return workflows.map((w) => ({
      ...w,
      accountUsername: w.instagramAccount.username,
      nodeCount: w._count.nodes,
      runCount: w._count.runs,
    }));
  }

  async findById(organizationId: string, id: string) {
    const workflow = await this.prisma.workflow.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: {
        nodes: { orderBy: { createdAt: 'asc' } },
        edges: { orderBy: { createdAt: 'asc' } },
        instagramAccount: { select: { username: true } },
      },
    });
    if (!workflow) throw new NotFoundException('Workflow not found');

    return {
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      status: workflow.status,
      priority: workflow.priority,
      version: workflow.version,
      instagramAccountId: workflow.instagramAccountId,
      accountUsername: workflow.instagramAccount.username,
      nodes: workflow.nodes.map((n) => ({
        id: n.id,
        type: n.type,
        config: parse(n.config),
        positionX: n.positionX,
        positionY: n.positionY,
      })),
      edges: workflow.edges.map((e) => ({
        id: e.id,
        sourceNodeId: e.sourceNodeId,
        targetNodeId: e.targetNodeId,
        sourceHandle: e.sourceHandle,
        label: e.label,
        config: parse(e.config),
      })),
    };
  }

  async update(organizationId: string, id: string, dto: UpdateWorkflowDto) {
    await this.getOwned(organizationId, id);
    await this.prisma.workflow.update({
      where: { id },
      data: { name: dto.name, description: dto.description, priority: dto.priority },
    });
    return this.findById(organizationId, id);
  }

  /** Full replace of the node/edge graph. Node ids are client-owned, so we upsert
   *  by id (keeping in-flight runs' currentNodeId stable) and delete the rest. */
  async saveGraph(organizationId: string, id: string, dto: SaveGraphDto) {
    await this.getOwned(organizationId, id);
    this.assertGraphShape(dto.nodes);

    const keepIds = dto.nodes.map((n) => n.id);

    await this.prisma.$transaction([
      // Edges are cheap and id-less to us — wipe and recreate.
      this.prisma.workflowEdge.deleteMany({ where: { workflowId: id } }),
      this.prisma.workflowNode.deleteMany({
        where: { workflowId: id, id: { notIn: keepIds.length ? keepIds : ['__none__'] } },
      }),
      ...dto.nodes.map((n) =>
        this.prisma.workflowNode.upsert({
          where: { id: n.id },
          create: {
            id: n.id,
            workflowId: id,
            type: n.type,
            config: JSON.stringify(n.config ?? {}),
            positionX: Math.round(n.positionX),
            positionY: Math.round(n.positionY),
          },
          update: {
            type: n.type,
            config: JSON.stringify(n.config ?? {}),
            positionX: Math.round(n.positionX),
            positionY: Math.round(n.positionY),
          },
        }),
      ),
      this.prisma.workflowEdge.createMany({
        data: dto.edges.map((e) => ({
          id: e.id ?? randomUUID(),
          workflowId: id,
          sourceNodeId: e.sourceNodeId,
          targetNodeId: e.targetNodeId,
          sourceHandle: e.sourceHandle ?? null,
          label: e.label ?? null,
          config: e.config ? JSON.stringify(e.config) : null,
        })),
      }),
      this.prisma.workflow.update({ where: { id }, data: { version: { increment: 1 } } }),
    ]);

    return this.findById(organizationId, id);
  }

  async publish(organizationId: string, id: string) {
    const graph = await this.findById(organizationId, id);
    this.assertPublishable(graph);
    await this.prisma.workflow.update({ where: { id }, data: { status: WorkflowStatus.ACTIVE } });
    return this.findById(organizationId, id);
  }

  async setStatus(organizationId: string, id: string, status: WorkflowStatus) {
    await this.getOwned(organizationId, id);
    await this.prisma.workflow.update({ where: { id }, data: { status } });
    return this.findById(organizationId, id);
  }

  async remove(organizationId: string, id: string) {
    await this.getOwned(organizationId, id);
    await this.prisma.workflow.update({
      where: { id },
      data: { deletedAt: new Date(), status: WorkflowStatus.ARCHIVED },
    });
    return { id };
  }

  // --- validation ------------------------------------------------------------

  private assertGraphShape(nodes: WorkflowNodeInput[]) {
    const triggers = nodes.filter((n) => n.type === WorkflowNodeType.TRIGGER);
    if (triggers.length !== 1) {
      throw new BadRequestException('A workflow must have exactly one Trigger node');
    }
  }

  private assertPublishable(graph: Awaited<ReturnType<WorkflowsService['findById']>>) {
    const trigger = graph.nodes.find((n) => n.type === 'TRIGGER');
    if (!trigger) throw new ForbiddenException('Add a Trigger before publishing');

    const hasOutgoing = (nodeId: string) => graph.edges.some((e) => e.sourceNodeId === nodeId);
    if (!hasOutgoing(trigger.id)) {
      throw new BadRequestException('The Trigger is not connected to anything');
    }
    for (const node of graph.nodes) {
      if (node.type === 'SEND_MESSAGE') {
        const text = (node.config as { text?: string }).text?.trim();
        if (!text) throw new BadRequestException('Every Send Message node needs message text');
      }
      if (node.type === 'TRIGGER') {
        const kw = (node.config as { keywords?: string[] }).keywords;
        const matchType = (node.config as { matchType?: string }).matchType;
        if (matchType !== 'ANY' && (!Array.isArray(kw) || kw.length === 0)) {
          throw new BadRequestException('The Trigger needs at least one keyword (or match type "any")');
        }
      }
    }
  }
}

export type WorkflowGraph = Awaited<ReturnType<WorkflowsService['findById']>>;
