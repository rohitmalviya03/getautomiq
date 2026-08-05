import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../common/types/jwt-payload.type';
import { SupportService } from '../support/support.service';
import {
  AdminReplyTicketDto,
  TicketListQueryDto,
  UpdateTicketDto,
} from '../support/dto/support.dto';
import { AdminActionMeta, AdminService } from './admin.service';

/**
 * The support queue as the platform owner sees it: every organization's tickets,
 * with internal notes, assignment and status control. Replies and status changes
 * notify the customer in-app so they don't have to poll the help centre.
 */
@Injectable()
export class AdminSupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly support: SupportService,
    private readonly admin: AdminService,
  ) {}

  async list(query: TicketListQueryDto) {
    const { status, category, search, page, pageSize } = query;

    const where: Prisma.SupportTicketWhereInput = {
      ...(status ? { status } : {}),
      ...(category ? { category } : {}),
      ...(search
        ? {
            OR: [
              { subject: { contains: search } },
              { contactEmail: { contains: search } },
              { organization: { name: { contains: search } } },
            ],
          }
        : {}),
    };

    const [rows, total, openCount] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        // Oldest-updated first would bury new tickets; support works newest-first
        // and uses the status filter to find what still needs a reply.
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
          assignedTo: { select: { id: true, email: true, firstName: true, lastName: true } },
          organization: { select: { id: true, name: true, slug: true } },
          _count: { select: { messages: true } },
        },
      }),
      this.prisma.supportTicket.count({ where }),
      this.prisma.supportTicket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
    ]);

    // Same envelope as the other admin lists (items/hasMore), plus the queue
    // badge count so the header doesn't need a second request.
    return {
      items: rows.map((t) => ({ ...this.support.toView(t), messageCount: t._count.messages })),
      page,
      pageSize,
      total,
      hasMore: page * pageSize < total,
      openCount,
    };
  }

  /** Full thread including internal notes — admin view only. */
  async detail(ticketId: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
        assignedTo: { select: { id: true, email: true, firstName: true, lastName: true } },
        organization: { select: { id: true, name: true, slug: true } },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');

    const messages = await this.prisma.supportTicketMessage.findMany({
      where: { ticketId },
      orderBy: { createdAt: 'asc' },
      include: { author: { select: { id: true, firstName: true, lastName: true } } },
    });

    return { ...this.support.toView(ticket), messages: messages.map((m) => this.support.toMessageView(m)) };
  }

  /**
   * Support reply. A public reply moves an OPEN ticket to IN_PROGRESS and pings
   * the customer; an internal note changes neither, so notes can be left freely.
   */
  async reply(ticketId: string, dto: AdminReplyTicketDto, actor: AuthenticatedUser) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');

    const isInternal = dto.isInternal ?? false;

    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.supportTicketMessage.create({
        data: {
          ticketId,
          authorUserId: actor.id,
          body: dto.message.trim(),
          isInternal,
        },
      });

      if (!isInternal && ticket.status === 'OPEN') {
        await tx.supportTicket.update({
          where: { id: ticketId },
          data: { status: 'IN_PROGRESS' },
        });
      } else {
        // Keep updatedAt moving so the queue ordering reflects real activity.
        await tx.supportTicket.update({ where: { id: ticketId }, data: { updatedAt: new Date() } });
      }

      return created;
    });

    if (!isInternal) {
      await this.notify(ticket.organizationId, ticket.createdByUserId, {
        title: `Support replied to “${ticket.subject}”`,
        body: dto.message.trim().slice(0, 200),
        ticketId,
      });
    }

    return this.support.toMessageView({ ...message, author: null });
  }

  /** Status / priority / assignment. Every change is audit-logged. */
  async update(
    ticketId: string,
    dto: UpdateTicketDto,
    actor: AuthenticatedUser,
    meta: AdminActionMeta,
  ) {
    const before = await this.prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!before) throw new NotFoundException('Ticket not found');

    const data: Prisma.SupportTicketUpdateInput = {};
    if (dto.status) {
      data.status = dto.status;
      // closedAt tracks when it actually closed, and is cleared on reopen.
      data.closedAt = dto.status === 'CLOSED' || dto.status === 'RESOLVED' ? new Date() : null;
    }
    if (dto.priority) data.priority = dto.priority;

    if (dto.assignedToUserId !== undefined) {
      if (dto.assignedToUserId === '') {
        data.assignedTo = { disconnect: true };
      } else {
        const assignee = await this.prisma.user.findFirst({
          where: { id: dto.assignedToUserId, isSuperAdmin: true },
          select: { id: true },
        });
        if (!assignee) {
          throw new BadRequestException('Tickets can only be assigned to a super-admin.');
        }
        data.assignedTo = { connect: { id: assignee.id } };
      }
    }

    const ticket = await this.prisma.supportTicket.update({ where: { id: ticketId }, data });

    await this.admin.audit(actor, meta, {
      action: AuditAction.UPDATE,
      entityType: 'SupportTicket',
      entityId: ticketId,
      organizationId: before.organizationId,
      before: { status: before.status, priority: before.priority, assignedToUserId: before.assignedToUserId },
      after: { status: ticket.status, priority: ticket.priority, assignedToUserId: ticket.assignedToUserId },
    });

    // Only a status change is worth interrupting the customer for.
    if (dto.status && dto.status !== before.status) {
      await this.notify(before.organizationId, before.createdByUserId, {
        title: `Your ticket “${before.subject}” is now ${dto.status.toLowerCase().replace('_', ' ')}`,
        body: 'Open the help centre to see the latest reply.',
        ticketId,
      });
    }

    return this.support.toView(ticket);
  }

  /** Best-effort in-app notice — a failure here must never fail the reply. */
  private async notify(
    organizationId: string,
    userId: string,
    notice: { title: string; body: string; ticketId: string },
  ): Promise<void> {
    try {
      await this.prisma.notification.create({
        data: {
          organizationId,
          userId,
          type: 'SYSTEM',
          title: notice.title,
          body: notice.body,
          metadata: JSON.stringify({ reason: 'support_ticket', ticketId: notice.ticketId }),
        },
      });
    } catch {
      // swallowed on purpose
    }
  }
}
