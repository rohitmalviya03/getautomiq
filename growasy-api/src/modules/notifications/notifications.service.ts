import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * In-app notification center. Notifications are written by other parts of the
 * system (e.g. the worker's monthly-DM-limit alert) and read here per user +
 * active organization.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, organizationId: string, limit = 20) {
    const rows = await this.prisma.notification.findMany({
      where: { userId, organizationId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 50),
    });
    return rows.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      isRead: n.isRead,
      createdAt: n.createdAt,
    }));
  }

  async unreadCount(userId: string, organizationId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, organizationId, isRead: false },
    });
    return { count };
  }

  async markRead(userId: string, organizationId: string, id: string) {
    await this.prisma.notification.updateMany({
      where: { id, userId, organizationId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { ok: true };
  }

  async markAllRead(userId: string, organizationId: string) {
    const res = await this.prisma.notification.updateMany({
      where: { userId, organizationId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { updated: res.count };
  }
}
