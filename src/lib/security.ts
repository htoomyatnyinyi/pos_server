import { prisma } from "./prisma";

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
