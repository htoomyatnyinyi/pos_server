import type { NotificationType, Prisma } from "@prisma/client";
import { prisma } from "./prisma";

type DbClient = typeof prisma | Prisma.TransactionClient;

export type CreateNotificationInput = {
  tenantId: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Prisma.InputJsonValue;
};

export async function createNotification(
  db: DbClient,
  input: CreateNotificationInput,
) {
  return db.notification.create({
    data: {
      tenantId: input.tenantId,
      userId: input.userId,
      type: input.type,
      title: input.title.trim(),
      message: input.message.trim(),
      metadata: input.metadata ?? undefined,
    },
  });
}

export function buildUserNotificationWhere(
  tenantId: string,
  userId: string,
): Prisma.NotificationWhereInput {
  return {
    tenantId,
    userId,
    deletedAt: null,
  };
}
