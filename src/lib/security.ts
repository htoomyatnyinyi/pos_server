import { prisma } from "./prisma";

export type AppPermission =
  | "VIEW_REPORTS"
  | "EDIT_PRICES"
  | "VOID_ORDERS"
  | "MANAGE_STAFF"
  | "MANAGE_INVENTORY"
  | "REFUND_ORDERS"
  | "VIEW_AUDIT_LOGS"
  | "MANAGE_PROMOTIONS"
  | "VIEW_ANALYTICS"
  | "MANAGE_API_KEYS"
  | "MANAGE_WEBHOOKS";

/**
 * Validate that a store belongs to the given tenant.
 * Throws an error with a user‑friendly message if not found.
 */
export async function validateStore(storeId: string, tenantId: string) {
  const store = await prisma.store.findFirst({
    where: { id: storeId, tenantId, deletedAt: null },
    select: { id: true },
  });
  if (!store) {
    throw new Error("Store not found or access denied.");
  }
  return store;
}

/**
 * Validate that a user belongs to the given tenant.
 */
export async function validateUser(userId: string, tenantId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId, deletedAt: null },
    select: { id: true },
  });
  if (!user) {
    throw new Error("User not found in this organization.");
  }
  return user;
}

/**
 * Role guard – returns true if the user's role is allowed.
 */
export function isAllowedRole(role: string, allowedRoles: string[]) {
  return allowedRoles.includes(role);
}

/**
 * Helper to throw a 403 error if the role is not allowed.
 * Call this at the start of your mutation handlers.
 */
export function requireRoles(role: string, allowedRoles: string[], set: any) {
  if (!isAllowedRole(role, allowedRoles)) {
    set.status = 403;
    throw new Error("Forbidden: Insufficient privileges.");
  }
}

export async function hasPermission(
  userId: string,
  role: string,
  permission: AppPermission,
) {
  if (role === "ADMIN" || role === "SUPER_ADMIN") return true;
  const assigned = await prisma.userPermission.findMany({
    where: { userId },
    select: { permission: true },
  });
  const permissions = assigned.map((entry) => String(entry.permission));
  return permissions.includes(permission);
}

export async function requirePermission(
  userId: string,
  role: string,
  permission: AppPermission,
  set: any,
) {
  if (!(await hasPermission(userId, role, permission))) {
    set.status = 403;
    throw new Error(`Forbidden: Missing permission ${permission}.`);
  }
}

export async function requireAnyPermission(
  userId: string,
  role: string,
  permissions: AppPermission[],
  set: any,
) {
  for (const permission of permissions) {
    if (await hasPermission(userId, role, permission)) return;
  }
  set.status = 403;
  throw new Error(`Forbidden: Missing one of: ${permissions.join(", ")}.`);
}

export async function requireDelegatedPermissions(
  userId: string,
  role: string,
  permissions: string[] | undefined,
  set: any,
) {
  if (!permissions || role === "ADMIN" || role === "SUPER_ADMIN") return;
  for (const permission of permissions) {
    if (!(await hasPermission(userId, role, permission as AppPermission))) {
      set.status = 403;
      throw new Error(`Forbidden: You cannot grant ${permission}.`);
    }
  }
}

// import { prisma } from "./prisma";

// /**
//  * Validate that a store belongs to the given tenant.
//  * Throws an error with a user‑friendly message if not found.
//  */
// export async function validateStore(storeId: string, tenantId: string) {
//   const store = await prisma.store.findFirst({
//     where: { id: storeId, tenantId, deletedAt: null },
//     select: { id: true },
//   });
//   if (!store) {
//     throw new Error("Store not found or access denied.");
//   }
//   return store;
// }

// /**
//  * Validate that a user belongs to the given tenant.
//  */
// export async function validateUser(userId: string, tenantId: string) {
//   const user = await prisma.user.findFirst({
//     where: { id: userId, tenantId, deletedAt: null },
//     select: { id: true },
//   });
//   if (!user) {
//     throw new Error("User not found in this organization.");
//   }
//   return user;
// }

// /**
//  * Role guard – returns true if the user's role is allowed.
//  * Use this in route handlers before performing mutations.
//  */
// export function isAllowedRole(role: string, allowedRoles: string[]) {
//   return allowedRoles.includes(role);
// }

// /**
//  * Helper to throw a 403 error if the role is not allowed.
//  * Call this at the start of your mutation handlers.
//  */
// export function requireRoles(role: string, allowedRoles: string[], set: any) {
//   if (!isAllowedRole(role, allowedRoles)) {
//     set.status = 403;
//     throw new Error("Forbidden: Insufficient privileges.");
//   }
// }
