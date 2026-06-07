import type { Context } from "elysia";

type QueryContext = {
  query: Record<string, string | undefined>;
  set: Context["set"];
};

export function requireTenantId({ query, set }: QueryContext): string | null {
  const tenantId = query.tenantId;
  if (!tenantId) {
    set.status = 400;
    return null;
  }
  return tenantId;
}

export function tenantFilter(tenantId: string) {
  return { tenantId, deletedAt: null as Date | null };
}
