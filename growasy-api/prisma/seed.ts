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
      monthlyPrice: 0,
      yearlyPrice: 0,
      limits: {
        maxInstagramAccounts: 1,
        maxContacts: 500,
        maxAutomations: 10,
        maxTeamMembers: 1,
        maxMessagesPerMonth: 500,
      },
      features: [
        '1 Instagram account',
        '500 DMs / month',
        'Comment → DM + story replies',
        'Unlimited keyword rules',
        'Basic analytics',
      ],
    },
    {
      name: 'Starter',
      tier: 'STARTER' as const,
      monthlyPrice: 79900,
      yearlyPrice: 769000,
      limits: {
        maxInstagramAccounts: 2,
        maxContacts: -1,
        maxAutomations: -1,
        maxTeamMembers: 1,
        maxMessagesPerMonth: 5000,
      },
      features: [
        '2 Instagram accounts',
        '5,000 DMs / month',
        'CRM + unlimited contacts',
        'Email capture · AI tools',
        'Link tracking + export',
        'Priority email support',
      ],
    },
    {
      name: 'Growth',
      tier: 'GROWTH' as const,
      monthlyPrice: 149900,
      yearlyPrice: 1439000,
      limits: {
        maxInstagramAccounts: 5,
        maxContacts: -1,
        maxAutomations: -1,
        maxTeamMembers: 5,
        maxMessagesPerMonth: 20000,
      },
      features: [
        '5 Instagram accounts',
        '20,000 DMs / month',
        '5 team members',
        'Advanced analytics · custom fields',
        'Multiple workspaces',
      ],
    },
    {
      name: 'Agency',
      tier: 'AGENCY' as const,
      monthlyPrice: 399900,
      yearlyPrice: 3839000,
      limits: {
        maxInstagramAccounts: 15,
        maxContacts: -1,
        maxAutomations: -1,
        maxTeamMembers: -1,
        maxMessagesPerMonth: 100000,
      },
      features: [
        '15 Instagram accounts',
        '100,000 DMs / month',
        'Unlimited team',
        'White-label reports · agency dashboard',
        'Premium support',
      ],
    },
  ];

  // Retire the tiers that are no longer offered so they can't be assigned.
  await prisma.plan.updateMany({
    where: { tier: { in: ['PROFESSIONAL', 'ENTERPRISE'] } },
    data: { isActive: false },
  });

  for (const plan of plans) {
    // limits/features are `String @db.LongText` (not Prisma's Json scalar) — see the
    // MySQL 5.6 compatibility note at the top of schema.prisma. Encode manually here;
    // any code that reads them back must JSON.parse().
    const data = {
      ...plan,
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
