import { prisma } from "@wishubest/db";
import { randomBytes } from "crypto";

export function generateId(prefix: string, length = 10): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i]! % alphabet.length];
  }
  return `${prefix}-${out}`;
}

export async function createAuditLog(input: {
  actorId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: unknown;
  ip?: string | null;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorId: input.actorId ?? null,
      action: input.action,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      metadataJson: input.metadata === undefined ? undefined : (input.metadata as any),
      ip: input.ip ?? null,
    },
  });
}

export async function createNotification(input: {
  userId: string;
  type: string;
  title: string;
  body: string;
  payload?: unknown;
}): Promise<void> {
  await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      payloadJson: input.payload === undefined ? undefined : (input.payload as any),
    },
  });
}