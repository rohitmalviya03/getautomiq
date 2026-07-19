import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CanActivate } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { PermissionKey } from '../constants/permissions.constant';
import { AuthenticatedUser } from '../types/jwt-payload.type';

/**
 * Resolves the caller's membership + role + permissions for the organization
 * named in `x-organization-id` and rejects the request unless every
 * permission declared via @RequirePermissions(...) is granted.
 * Super admins bypass the check entirely.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<PermissionKey[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser = request.user;
    const organizationId: string | undefined = request.headers['x-organization-id'];

    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }
    if (!organizationId) {
      throw new ForbiddenException('x-organization-id header is required for this route');
    }
    if (user.isSuperAdmin) {
      return true;
    }

    const membership = await this.prisma.organizationMember.findFirst({
      where: { userId: user.id, organizationId, status: 'ACTIVE', deletedAt: null },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });

    if (!membership) {
      throw new ForbiddenException('You are not an active member of this organization');
    }

    const granted = new Set(
      membership.role.permissions.map((rp) => rp.permission.resource + ':' + rp.permission.action),
    );
    const missing = required.filter((permission) => !granted.has(permission));

    if (missing.length > 0) {
      throw new ForbiddenException(`Missing required permission(s): ${missing.join(', ')}`);
    }

    request.organizationMembership = membership;
    return true;
  }
}
