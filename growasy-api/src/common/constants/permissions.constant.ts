/**
 * Canonical permission catalog. Seeded into the `Permission` table by
 * prisma/seed.ts and referenced by name (never by free-form string) when
 * guarding routes with @RequirePermissions(...).
 *
 * Format: "<resource>:<action>"
 */
export const PERMISSIONS = {
  ORGANIZATION_MANAGE: 'organization:manage',
  MEMBER_INVITE: 'member:invite',
  MEMBER_REMOVE: 'member:remove',
  ROLE_MANAGE: 'role:manage',

  INSTAGRAM_ACCOUNT_CONNECT: 'instagram_account:connect',
  INSTAGRAM_ACCOUNT_DISCONNECT: 'instagram_account:disconnect',
  INSTAGRAM_ACCOUNT_READ: 'instagram_account:read',

  AUTOMATION_CREATE: 'automation:create',
  AUTOMATION_READ: 'automation:read',
  AUTOMATION_UPDATE: 'automation:update',
  AUTOMATION_DELETE: 'automation:delete',

  CONTACT_READ: 'contact:read',
  CONTACT_WRITE: 'contact:write',
  CONTACT_EXPORT: 'contact:export',
  CONTACT_DELETE: 'contact:delete',

  CONVERSATION_READ: 'conversation:read',
  CONVERSATION_REPLY: 'conversation:reply',

  ANALYTICS_READ: 'analytics:read',

  LINK_READ: 'link:read',
  LINK_WRITE: 'link:write',
  LINK_DELETE: 'link:delete',

  BILLING_MANAGE: 'billing:manage',
  BILLING_READ: 'billing:read',

  SETTINGS_MANAGE: 'settings:manage',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: PermissionKey[] = Object.values(PERMISSIONS);

/** System role slugs seeded into every new organization. */
export const SYSTEM_ROLES = {
  OWNER: 'owner',
  ADMIN: 'admin',
  EDITOR: 'editor',
  VIEWER: 'viewer',
} as const;

/** Permissions granted to each system role at org-creation time. Owner gets everything. */
export const SYSTEM_ROLE_PERMISSIONS: Record<string, PermissionKey[]> = {
  [SYSTEM_ROLES.OWNER]: ALL_PERMISSIONS,
  [SYSTEM_ROLES.ADMIN]: ALL_PERMISSIONS.filter((p) => p !== PERMISSIONS.ORGANIZATION_MANAGE),
  [SYSTEM_ROLES.EDITOR]: [
    PERMISSIONS.INSTAGRAM_ACCOUNT_READ,
    PERMISSIONS.AUTOMATION_CREATE,
    PERMISSIONS.AUTOMATION_READ,
    PERMISSIONS.AUTOMATION_UPDATE,
    PERMISSIONS.CONTACT_READ,
    PERMISSIONS.CONTACT_WRITE,
    PERMISSIONS.CONVERSATION_READ,
    PERMISSIONS.CONVERSATION_REPLY,
    PERMISSIONS.ANALYTICS_READ,
    PERMISSIONS.LINK_READ,
    PERMISSIONS.LINK_WRITE,
  ],
  [SYSTEM_ROLES.VIEWER]: [
    PERMISSIONS.INSTAGRAM_ACCOUNT_READ,
    PERMISSIONS.AUTOMATION_READ,
    PERMISSIONS.CONTACT_READ,
    PERMISSIONS.CONVERSATION_READ,
    PERMISSIONS.ANALYTICS_READ,
    PERMISSIONS.LINK_READ,
    PERMISSIONS.BILLING_READ,
  ],
};
