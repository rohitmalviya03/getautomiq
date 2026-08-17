import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface OnboardingStatus {
  instagramConnected: boolean;
  hasActiveAutomation: boolean;
}

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Whether the two first-run steps are done. Derived entirely from accounts and
   * rules the workspace already has — there is no onboarding table, so nothing
   * can drift out of sync with reality or need backfilling for existing users.
   */
  async status(organizationId: string): Promise<OnboardingStatus> {
    const [connectedAccounts, activeRules] = await Promise.all([
      this.prisma.instagramAccount.count({
        where: {
          organizationId,
          deletedAt: null,
          // NEEDS_RECONNECT counts as connected: the account is linked and still
          // usable, its token is just nearing expiry. Excluding it would pop the
          // onboarding checklist back up for an established user, which reads as
          // the app forgetting they ever set up.
          status: { in: ['CONNECTED', 'NEEDS_RECONNECT'] },
        },
      }),
      this.prisma.automationRule.count({
        where: { organizationId, deletedAt: null, status: 'ACTIVE' },
      }),
    ]);

    return {
      instagramConnected: connectedAccounts > 0,
      hasActiveAutomation: activeRules > 0,
    };
  }
}
