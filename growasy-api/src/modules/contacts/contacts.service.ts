import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginatedResult } from '../../common/dto/pagination-query.dto';
import { ListContactsQueryDto } from './dto/list-contacts-query.dto';

/** Public contact fields — CRM leads captured when an automation engages someone. */
const CONTACT_SELECT = {
  id: true,
  instagramAccountId: true,
  instagramScopedId: true,
  username: true,
  name: true,
  email: true,
  phone: true,
  isSubscribed: true,
  lastInteractionAt: true,
  createdAt: true,
} as const;

/** Hard cap on a single CSV export so a huge org can't OOM the process. */
const CSV_EXPORT_LIMIT = 10_000;

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  private buildWhere(organizationId: string, query: ListContactsQueryDto): Prisma.ContactWhereInput {
    return {
      organizationId,
      deletedAt: null,
      ...(query.instagramAccountId ? { instagramAccountId: query.instagramAccountId } : {}),
      ...(query.search
        ? {
            OR: [
              { username: { contains: query.search } },
              { name: { contains: query.search } },
              { email: { contains: query.search } },
            ],
          }
        : {}),
    };
  }

  async list(
    organizationId: string,
    query: ListContactsQueryDto,
  ): Promise<PaginatedResult<Prisma.ContactGetPayload<{ select: typeof CONTACT_SELECT }>>> {
    const where = this.buildWhere(organizationId, query);
    const rows = await this.prisma.contact.findMany({
      where,
      select: CONTACT_SELECT,
      orderBy: { createdAt: 'desc' },
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > query.limit;
    const data = hasMore ? rows.slice(0, query.limit) : rows;
    return {
      data,
      meta: {
        nextCursor: hasMore ? data[data.length - 1].id : null,
        limit: query.limit,
        hasMore,
      },
    };
  }

  async findById(organizationId: string, contactId: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, organizationId, deletedAt: null },
      select: CONTACT_SELECT,
    });
    if (!contact) {
      throw new NotFoundException('Contact not found');
    }
    return contact;
  }

  /** Builds a CSV of the org's contacts (optionally scoped to one account). */
  async exportCsv(organizationId: string, instagramAccountId?: string): Promise<string> {
    const rows = await this.prisma.contact.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(instagramAccountId ? { instagramAccountId } : {}),
      },
      select: CONTACT_SELECT,
      orderBy: { createdAt: 'desc' },
      take: CSV_EXPORT_LIMIT,
    });

    const header = ['username', 'name', 'email', 'phone', 'igScopedId', 'lastInteractionAt', 'createdAt'];
    const lines = rows.map((c) =>
      [
        c.username ?? '',
        c.name ?? '',
        c.email ?? '',
        c.phone ?? '',
        c.instagramScopedId,
        c.lastInteractionAt?.toISOString() ?? '',
        c.createdAt.toISOString(),
      ]
        .map(csvCell)
        .join(','),
    );
    return [header.join(','), ...lines].join('\r\n');
  }
}

/** RFC-4180 cell escaping: quote when the value contains a comma/quote/newline. */
function csvCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
