import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';
import { ApiKeysService } from './api-keys.service';
import { PlanLimitsService } from '../billing/plan-limits.service';

function contextWith(headers: Record<string, string>) {
  const request: Record<string, unknown> = { headers };
  return {
    request,
    ctx: {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext,
  };
}

function makeGuard(
  resolved: { organizationId: string; apiKeyId: string } | null,
  unlocked = true,
) {
  const apiKeys = { resolve: jest.fn().mockResolvedValue(resolved) } as unknown as ApiKeysService;
  const planLimits = {
    hasFeature: jest.fn().mockResolvedValue(unlocked),
  } as unknown as PlanLimitsService;
  return { guard: new ApiKeyGuard(apiKeys, planLimits), apiKeys };
}

describe('ApiKeyGuard', () => {
  it('takes the organization from the key, not from the request header', async () => {
    const { guard } = makeGuard({ organizationId: 'org-real', apiKeyId: 'key-1' });
    const { ctx, request } = contextWith({
      authorization: 'Bearer amq_live_abc',
      // A caller trying to write into someone else's workspace.
      'x-organization-id': 'org-victim',
    });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(request.apiKeyOrganizationId).toBe('org-real');
  });

  it('rejects a request with no key', async () => {
    const { guard } = makeGuard(null);
    const { ctx } = contextWith({});

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an unknown or revoked key', async () => {
    const { guard } = makeGuard(null);
    const { ctx } = contextWith({ authorization: 'Bearer amq_live_nope' });

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a valid key whose workspace has downgraded off API access', async () => {
    const { guard } = makeGuard({ organizationId: 'org-1', apiKeyId: 'key-1' }, false);
    const { ctx } = contextWith({ authorization: 'Bearer amq_live_abc' });

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
