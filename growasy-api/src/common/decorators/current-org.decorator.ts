import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Reads the active organization id from the `x-organization-id` header.
 * Users can belong to multiple organizations; the client selects the active
 * one and sends it on every request. PermissionsGuard validates membership.
 */
export const CurrentOrgId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return request.headers['x-organization-id'];
  },
);
