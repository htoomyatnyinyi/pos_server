// middlewares/permissions.ts
import { Elysia } from "elysia";

type Permission =
  | "VIEW_REPORTS"
  | "EDIT_PRICES"
  | "VOID_ORDERS"
  | "MANAGE_STAFF"
  | "MANAGE_INVENTORY"
  | "REFUND_ORDERS";

export const permissionMiddleware = (requiredPermissions: Permission[]) =>
  new Elysia().derive(async ({ user, set }) => {
    if (!user) {
      set.status = 401;
      throw new Error("Unauthorized");
    }

    const hasAllPermissions = requiredPermissions.every((permission) =>
      user.permissions?.includes(permission),
    );

    if (!hasAllPermissions) {
      set.status = 403;
      throw new Error(
        `Missing required permissions: ${requiredPermissions.join(", ")}`,
      );
    }

    return { user };
  });
