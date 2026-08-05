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
  // Prices are in paise (minor units of INR).
  //
  // IMPORTANT: this is BOOTSTRAP data, not the source of truth. Pricing, copy,
  // limits and promos are edited from the admin console (Pricing tab) and live
  // in the DB, so re-running the seed must NOT clobber those edits — existing
  // plans only get *missing* storefront fields backfilled. Set
  // SEED_FORCE_PLANS=1 to deliberately reset every plan to the values below.
  const plans = [
    {
      name: 'Free',
      tier: 'FREE' as const,
      currency: 'INR',
      monthlyPrice: 0,
      yearlyPrice: 0,
      tag: 'Free',
      subtitle: 'Perfect for trying Automiq.',
      ctaLabel: 'Get Started Free',
      inheritsLabel: null,
      isPopular: false,
      isBestValue: false,
      contactSales: false,
      sortOrder: 0,
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
        '500 automated DMs / month',
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
      tag: 'Starter',
      subtitle: 'For creators & small businesses.',
      ctaLabel: 'Start Free Trial',
      inheritsLabel: null,
      isPopular: false,
      isBestValue: false,
      contactSales: false,
      sortOrder: 1,
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
      tag: 'Growth',
      subtitle: 'For businesses generating leads every day.',
      ctaLabel: 'Start Growing',
      inheritsLabel: 'Everything in Starter, plus:',
      isPopular: true,
      isBestValue: true,
      contactSales: false,
      sortOrder: 2,
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
        'Visual workflow builder',
        'Post-wise analytics',
        'Broadcast / bulk DM',
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
      tag: 'Pro',
      subtitle: 'For scaling teams & power users.',
      ctaLabel: 'Choose Pro',
      inheritsLabel: 'Everything in Growth, plus:',
      isPopular: false,
      isBestValue: false,
      contactSales: false,
      sortOrder: 3,
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
      tag: 'Agency',
      subtitle: 'For agencies managing multiple clients.',
      ctaLabel: 'Contact Sales',
      inheritsLabel: 'Everything in Pro, plus:',
      isPopular: false,
      isBestValue: false,
      contactSales: true,
      sortOrder: 4,
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

  const force = process.env.SEED_FORCE_PLANS === '1';
  let created = 0;
  let backfilled = 0;

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

    const existing = await prisma.plan.findUnique({ where: { tier: plan.tier } });
    if (!existing) {
      await prisma.plan.create({ data });
      created += 1;
      continue;
    }

    if (force) {
      await prisma.plan.update({ where: { tier: plan.tier }, data });
      backfilled += 1;
      continue;
    }

    // Backfill only what the admin has not set. Price, limits, features and any
    // promo are left exactly as they are in the DB — the console owns them.
    const patch: Record<string, unknown> = {};
    if (existing.tag == null) patch.tag = plan.tag;
    if (existing.subtitle == null) patch.subtitle = plan.subtitle;
    if (existing.ctaLabel == null) patch.ctaLabel = plan.ctaLabel;
    if (existing.inheritsLabel == null && plan.inheritsLabel) {
      patch.inheritsLabel = plan.inheritsLabel;
    }
    // sortOrder defaults to 0 for every row, which would collapse the ordering —
    // seed it once while every plan still sits at the default.
    if (existing.sortOrder === 0 && plan.sortOrder !== 0) patch.sortOrder = plan.sortOrder;
    if (existing.contactSales === false && plan.contactSales) patch.contactSales = true;
    if (existing.isPopular === false && plan.isPopular) patch.isPopular = true;
    if (existing.isBestValue === false && plan.isBestValue) patch.isBestValue = true;

    if (Object.keys(patch).length > 0) {
      await prisma.plan.update({ where: { tier: plan.tier }, data: patch });
      backfilled += 1;
    }
  }
  console.log(
    `Plans: ${created} created, ${backfilled} ${force ? 'force-reset' : 'backfilled'}` +
      `${force ? '' : ' (existing pricing left untouched — edit it in the admin console)'}`,
  );
}

/**
 * Nothing in this seed creates or deletes users, organizations, subscriptions or
 * any other customer data — it only maintains platform catalogues:
 *
 *   permissions  the global Permission catalogue (upsert, additive)
 *   roles        grants newly-added permissions to existing system roles
 *                (createMany + skipDuplicates — additive, never revokes)
 *   plans        the pricing catalogue
 *
 * Run a subset by argument or SEED_ONLY, e.g. on production where you only want
 * the pricing rows touched:
 *
 *   npm run prisma:seed:plans           (→ ts-node prisma/seed.ts plans)
 *   npx prisma db seed -- plans
 *   SEED_ONLY=plans,permissions npx prisma db seed
 *
 * The argument form is preferred because `VAR=x cmd` is not valid syntax in
 * PowerShell or cmd.exe, so it works the same on Windows and on the VPS.
 */
async function main() {
  const only = [...process.argv.slice(2), ...(process.env.SEED_ONLY ?? '').split(',')]
    .flatMap((s) => s.split(','))
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const wants = (step: string) => only.length === 0 || only.includes(step);

  const known = ['permissions', 'roles', 'plans'];
  const unknown = only.filter((s) => !known.includes(s));
  if (unknown.length > 0) {
    console.error(`Unknown seed step(s): ${unknown.join(', ')}. Known: ${known.join(', ')}`);
    process.exit(1);
  }
  if (only.length > 0) console.log(`Seeding only: ${only.join(', ')} — skipping everything else`);

  if (wants('permissions')) await seedPermissions();
  if (wants('roles')) await backfillSystemRolePermissions();
  if (wants('plans')) await seedPlans();
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
