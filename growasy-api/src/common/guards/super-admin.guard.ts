import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../types/jwt-payload.type';

/**
 * Gates a controller to platform owners (User.isSuperAdmin). Runs AFTER the global
 * JwtAuthGuard, so req.user is already populated and re-validated against the DB on
 * every request (see JwtStrategy) — revoking a super-admin takes effect within one
 * access-token lifetime. Apply per-controller with @UseGuards(SuperAdminGuard);
 * never register globally, or it would lock every route to admins.
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user: AuthenticatedUser | undefined = req.user;
    if (!user?.isSuperAdmin) {
      throw new ForbiddenException('Super-admin access required');
    }
    return true;
  }
}
