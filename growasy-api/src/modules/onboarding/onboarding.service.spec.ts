import { OnboardingService } from './onboarding.service';
import { PrismaService } from '../../prisma/prisma.service';

const ORG = 'org-1';

function makeService(accounts: number, rules: number) {
  const instagramCount = jest.fn().mockResolvedValue(accounts);
  const ruleCount = jest.fn().mockResolvedValue(rules);
  const prisma = {
    instagramAccount: { count: instagramCount },
    automationRule: { count: ruleCount },
  } as unknown as PrismaService;
  return { service: new OnboardingService(prisma), instagramCount, ruleCount };
}

describe('OnboardingService', () => {
  it('reports both steps outstanding for a brand-new workspace', async () => {
    const { service } = makeService(0, 0);
    await expect(service.status(ORG)).resolves.toEqual({
      instagramConnected: false,
      hasActiveAutomation: false,
    });
  });

  it('reports both done once an account and an active rule exist', async () => {
    const { service } = makeService(1, 2);
    await expect(service.status(ORG)).resolves.toEqual({
      instagramConnected: true,
      hasActiveAutomation: true,
    });
  });

  it('only counts rules that are actually running', async () => {
    const { service, ruleCount } = makeService(1, 0);

    await service.status(ORG);

    // A draft or paused rule must not tick the step — the checklist claims the
    // user has automation working, and a DRAFT does nothing.
    expect(ruleCount).toHaveBeenCalledWith({
      where: { organizationId: ORG, deletedAt: null, status: 'ACTIVE' },
    });
  });

  it('treats an account that needs reconnecting as still connected', async () => {
    const { service, instagramCount } = makeService(1, 1);

    await service.status(ORG);

    const where = instagramCount.mock.calls[0][0].where;
    expect(where.status).toEqual({ in: ['CONNECTED', 'NEEDS_RECONNECT'] });
    // Otherwise an expiring token would re-show onboarding to an established user.
  });

  it('scopes both counts to the caller organization and ignores deleted rows', async () => {
    const { service, instagramCount, ruleCount } = makeService(1, 1);

    await service.status(ORG);

    expect(instagramCount.mock.calls[0][0].where).toMatchObject({
      organizationId: ORG,
      deletedAt: null,
    });
    expect(ruleCount.mock.calls[0][0].where).toMatchObject({
      organizationId: ORG,
      deletedAt: null,
    });
  });
});
