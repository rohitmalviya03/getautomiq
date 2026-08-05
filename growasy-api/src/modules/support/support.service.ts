import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, SupportTicket, SupportTicketStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../common/types/jwt-payload.type';
import { CreateTicketDto, ReplyTicketDto } from './dto/support.dto';

/** Statuses a customer reply should reopen — a resolved ticket isn't done if they write back. */
const REOPEN_FROM: SupportTicketStatus[] = ['RESOLVED', 'CLOSED'];

const ticketInclude = {
  createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
  assignedTo: { select: { id: true, email: true, firstName: true, lastName: true } },
  organization: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.SupportTicketInclude;

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Raises a ticket. The description becomes the first message so the thread and
   * the ticket never disagree about what was originally reported.
   */
  async create(organizationId: string, actor: AuthenticatedUser, dto: CreateTicketDto) {
    const ticket = await this.prisma.$transaction(async (tx) => {
      const created = await tx.supportTicket.create({
        data: {
          organizationId,
          createdByUserId: actor.id,
          subject: dto.subject.trim(),
          category: dto.category ?? 'OTHER',
          // Fall back to the account email so support always has somewhere to reply.
          contactEmail: dto.contactEmail?.trim() || actor.email,
          contactPhone: dto.contactPhone?.trim() || null,
          lastCustomerReplyAt: new Date(),
        },
      });

      await tx.supportTicketMessage.create({
        data: { ticketId: created.id, authorUserId: actor.id, body: dto.message.trim() },
      });

      return created;
    });

    this.logger.log(`Support ticket ${ticket.id} raised by ${actor.email}`);
    return this.toView(ticket);
  }

  /** Tickets raised inside the caller's organization, newest first. */
  async listMine(organizationId: string) {
    const tickets = await this.prisma.supportTicket.findMany({
      where: { organizationId },
      orderBy: { updatedAt: 'desc' },
      include: {
        ...ticketInclude,
        _count: { select: { messages: true } },
      },
    });
    return tickets.map((t) => ({ ...this.toView(t), messageCount: t._count.messages }));
  }

  /**
   * One ticket with its thread. Internal notes are stripped — they exist for the
   * support team and must never reach the customer.
   */
  async getForCustomer(organizationId: string, ticketId: string) {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, organizationId },
      include: ticketInclude,
    });
    if (!ticket) throw new NotFoundException('Ticket not found');

    const messages = await this.prisma.supportTicketMessage.findMany({
      where: { ticketId, isInternal: false },
      orderBy: { createdAt: 'asc' },
      include: { author: { select: { id: true, firstName: true, lastName: true } } },
    });

    return { ...this.toView(ticket), messages: messages.map((m) => this.toMessageView(m)) };
  }

  /** Customer reply. Reopens the ticket if support had already closed it. */
  async reply(
    organizationId: string,
    ticketId: string,
    actor: AuthenticatedUser,
    dto: ReplyTicketDto,
  ) {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, organizationId },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');

    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.supportTicketMessage.create({
        data: { ticketId, authorUserId: actor.id, body: dto.message.trim() },
      });
      await tx.supportTicket.update({
        where: { id: ticketId },
        data: {
          lastCustomerReplyAt: new Date(),
          // A reply on a resolved/closed ticket means it wasn't actually resolved.
          ...(REOPEN_FROM.includes(ticket.status) ? { status: 'OPEN', closedAt: null } : {}),
        },
      });
      return created;
    });

    return this.toMessageView({ ...message, author: null });
  }

  /** Customers may close their own ticket; they may not reopen a closed one this way. */
  async close(organizationId: string, ticketId: string) {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, organizationId },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.status === 'CLOSED') throw new ForbiddenException('This ticket is already closed');

    const updated = await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status: 'CLOSED', closedAt: new Date() },
    });
    return this.toView(updated);
  }

  // --- shared shaping -------------------------------------------------------

  toView(ticket: SupportTicket & Partial<Prisma.SupportTicketGetPayload<{ include: typeof ticketInclude }>>) {
    return {
      id: ticket.id,
      subject: ticket.subject,
      category: ticket.category,
      status: ticket.status,
      priority: ticket.priority,
      contactEmail: ticket.contactEmail,
      contactPhone: ticket.contactPhone,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      closedAt: ticket.closedAt,
      lastCustomerReplyAt: ticket.lastCustomerReplyAt,
      organization: ticket.organization ?? null,
      createdBy: ticket.createdBy ?? null,
      assignedTo: ticket.assignedTo ?? null,
    };
  }

  toMessageView(message: {
    id: string;
    body: string;
    isInternal: boolean;
    createdAt: Date;
    authorUserId: string | null;
    author?: { id: string; firstName: string; lastName: string } | null;
  }) {
    return {
      id: message.id,
      body: message.body,
      isInternal: message.isInternal,
      createdAt: message.createdAt,
      authorUserId: message.authorUserId,
      authorName: message.author
        ? `${message.author.firstName} ${message.author.lastName}`.trim()
        : null,
    };
  }
}
