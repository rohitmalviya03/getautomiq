import { PrismaClient } from '@prisma/client';
import {
  ALL_PERMISSIONS,
  SYSTEM_ROLE_PERMISSIONS,
} from '../src/common/constants/permissions.constant';

const prisma = new PrismaClient();

async function seedPermissions() {
  for (const key of ALL_PERMISSIONS) {
    const [resource, action] = key.split(':');
    await prisma.permission.upsert({
      where: { resource_action: { resource, action } },
      update: {},
      create: { resource, action },
    });
  }
  console.log(`Seeded ${ALL_PERMISSIONS.length} permissions`);
}

/**
 * Grants any newly-added permissions to existing organizations' system roles.
 * Org role→permission rows are created once at org-creation time, so without
 * this backfill a permission added later (e.g. link:*) would never reach roles
 * that already exist. Idempotent: skipDuplicates means re-running is a no-op.
 */
async function backfillSystemRolePermissions() {
  const permissions = await prisma.permission.findMany();
  const idByKey = new Map(permissions.map((p) => [`${p.resource}:${p.action}`, p.id]));

  const systemRoles = await prisma.role.findMany({ where: { isSystem: true } });
  let granted = 0;

  for (const role of systemRoles) {
    const desiredKeys = SYSTEM_ROLE_PERMISSIONS[role.slug] ?? [];
    const rows = desiredKeys
      .map((key) => idByKey.get(key))
      .filter((id): id is string => Boolean(id))
      .map((permissionId) => ({ roleId: role.id, permissionId }));
    if (rows.length === 0) continue;
    const result = await prisma.rolePermission.createMany({ data: rows, skipDuplicates: true });
    granted += result.count;
  }
  console.log(`Backfilled ${granted} role-permission grant(s) across ${systemRoles.length} roles`);
}

async function seedPlans() {
  // Prices are in paise (minor units of INR). Kept in sync with growasy-web's
  // src/lib/plans.ts (the marketing/display copy).
  const plans = [
    {
      name: 'Free',
      tier: 'FREE' as const,
      currency: 'INR',
      monthlyPrice: 0,
      yearlyPrice: 0,
      limits: {
        maxInstagramAccounts: 1,
        maxContacts: 500,
        maxAutomations: 10,
        maxTeamMembers: 1,
        maxMessagesPerMonth: 500,
        aiAgent: false,
      },
      features: [
        '1 Instagram account',
        '500 DMs / month',
        '1 team member',
        'Comment → DM + story replies',
        'Unlimited keyword rules',
        'Basic analytics',
      ],
    },
    {
      name: 'Starter',
      tier: 'STARTER' as const,
      currency: 'INR',
      monthlyPrice: 14900,
      yearlyPrice: 143000,
      limits: {
        maxInstagramAccounts: 2,
        maxContacts: -1,
        maxAutomations: -1,
        maxTeamMembers: 1,
        maxMessagesPerMonth: 5000,
        aiAgent: false,
      },
      features: [
        '2 Instagram accounts',
        '5,000 DMs / month',
        '1 team member',
        'Unlimited contacts + CRM',
        'Email capture',
        'AI caption & hashtag tools',
        'Link tracking + CSV export',
        'No Automiq branding',
      ],
    },
    {
      name: 'Growth',
      tier: 'GROWTH' as const,
      currency: 'INR',
      monthlyPrice: 49900,
      yearlyPrice: 479000,
      limits: {
        maxInstagramAccounts: 5,
        maxContacts: -1,
        maxAutomations: -1,
        maxTeamMembers: 5,
        maxMessagesPerMonth: 20000,
        aiAgent: true,
      },
      features: [
        '5 Instagram accounts',
        '20,000 DMs / month',
        '5 team members',
        'AI DM Agent',
        'Broadcast / bulk DM',
        'Advanced analytics',
        'Workflow templates · custom fields',
        'Multiple workspaces · priority queue',
      ],
    },
    {
      // Displayed as "Pro" — mapped onto the PROFESSIONAL tier.
      name: 'Pro',
      tier: 'PROFESSIONAL' as const,
      currency: 'INR',
      monthlyPrice: 99900,
      yearlyPrice: 959000,
      limits: {
        maxInstagramAccounts: 10,
        maxContacts: -1,
        maxAutomations: -1,
        maxTeamMembers: 10,
        maxMessagesPerMonth: 50000,
        aiAgent: true,
      },
      features: [
        '10 Instagram accounts',
        '50,000 DMs / month',
        '10 team members',
        'AI DM Agent + custom training',
        'A/B testing',
        'Revenue attribution',
        'API access',
      ],
    },
    {
      name: 'Agency',
      tier: 'AGENCY' as const,
      currency: 'INR',
      // Custom / contact-sales — not self-serve, so price is not used for checkout.
      monthlyPrice: 0,
      yearlyPrice: 0,
      limits: {
        maxInstagramAccounts: 15,
        maxContacts: -1,
        maxAutomations: -1,
        maxTeamMembers: -1,
        maxMessagesPerMonth: 100000,
        aiAgent: true,
      },
      features: [
        '15 Instagram accounts',
        '100,000 DMs / month',
        'Unlimited team',
        'AI DM Agent',
        'White-label reports',
        'Agency dashboard',
        'Dedicated manager',
      ],
    },
  ];

  // Retire tiers no longer offered (ENTERPRISE). PROFESSIONAL is now "Pro".
  await prisma.plan.updateMany({
    where: { tier: { in: ['ENTERPRISE'] } },
    data: { isActive: false },
  });

  for (const plan of plans) {
    // limits/features are `String @db.LongText` (not Prisma's Json scalar) — see the
    // MySQL 5.6 compatibility note at the top of schema.prisma. Encode manually here;
    // any code that reads them back must JSON.parse().
    const data = {
      ...plan,
      isActive: true, // re-activate offered tiers (PROFESSIONAL was previously retired)
      limits: JSON.stringify(plan.limits),
      features: JSON.stringify(plan.features),
    };
    await prisma.plan.upsert({
      where: { tier: plan.tier },
      update: data,
      create: data,
    });
  }
  console.log(`Seeded ${plans.length} plans`);
}

async function main() {
  await seedPermissions();
  await backfillSystemRolePermissions();
  await seedPlans();
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
