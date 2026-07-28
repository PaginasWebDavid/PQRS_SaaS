import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { registerAuditLog } from "@/domains/platform/audit.service";
import {
  assertAvatarFileName,
  deleteGlobalUserAvatar,
  getOwnedGlobalAvatarPathFromUrl,
  matchesDeclaredType,
  uploadGlobalUserAvatar,
} from "@/lib/storage";
import { AccountSecurityError } from "@/domains/account/account-security";

export const AVATAR_ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const AVATAR_MAX_SIZE = 2 * 1024 * 1024;

type AvatarTestStep = "AFTER_AVATAR_UPLOAD";
let avatarTestHook: ((step: AvatarTestStep) => Promise<void> | void) | null = null;

export function __unsafeSetAvatarTestHook(hook: ((step: AvatarTestStep) => Promise<void> | void) | null) {
  if (process.env.NODE_ENV !== "test") throw new Error("AVATAR_TEST_HOOK_FORBIDDEN");
  avatarTestHook = hook;
}

export class AvatarValidationError extends Error {
  constructor() {
    super("Archivo invalido");
    this.name = "AvatarValidationError";
  }
}

export function validateAvatarInput(input: {
  fileName: string;
  contentType: string;
  buffer: Buffer;
}) {
  if (
    !AVATAR_ALLOWED_TYPES.has(input.contentType) ||
    input.buffer.length < 12 ||
    input.buffer.length > AVATAR_MAX_SIZE
  ) {
    throw new AvatarValidationError();
  }
  try {
    assertAvatarFileName(input.fileName, input.contentType);
  } catch {
    throw new AvatarValidationError();
  }
  if (!matchesDeclaredType(input.buffer, input.contentType)) throw new AvatarValidationError();
}

async function cleanupOwnedAvatar(url: string | null, userId: string) {
  let path: string | null = null;
  try {
    path = getOwnedGlobalAvatarPathFromUrl(url, userId);
  } catch {
    return;
  }
  if (!path) return;
  await deleteGlobalUserAvatar(path, userId);
}

export async function replaceGlobalUserAvatar(input: {
  userId: string;
  fileName: string;
  contentType: string;
  buffer: Buffer;
  origin?: string | null;
}) {
  validateAvatarInput(input);
  const current = await prisma.user.findFirst({
    where: { id: input.userId, isActive: true },
    select: { id: true, image: true },
  });
  if (!current) throw new AccountSecurityError("ACCOUNT_UNAVAILABLE");

  const uploaded = await uploadGlobalUserAvatar({
    userId: current.id,
    contentType: input.contentType,
    buffer: input.buffer,
  });
  try {
    if (avatarTestHook) await avatarTestHook("AFTER_AVATAR_UPLOAD");
    await prisma.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: { id: current.id, isActive: true, image: current.image },
        data: { image: uploaded.url },
      });
      if (updated.count !== 1) throw new AccountSecurityError("PROFILE_CONFLICT");
      await registerAuditLog({
        actorUserId: current.id,
        tenantId: null,
        action: AuditAction.AVATAR_UPDATED,
        targetType: "User",
        targetId: current.id,
        origin: input.origin ?? "api",
        metadata: { contentType: input.contentType, size: input.buffer.length },
      }, tx);
    });
  } catch (error) {
    await cleanupOwnedAvatar(uploaded.url, current.id).catch(() => undefined);
    throw error;
  }

  if (current.image && current.image !== uploaded.url) {
    await cleanupOwnedAvatar(current.image, current.id).catch(() => undefined);
  }
  return { image: uploaded.url };
}

export async function removeGlobalUserAvatar(input: { userId: string; origin?: string | null }) {
  const current = await prisma.user.findFirst({
    where: { id: input.userId, isActive: true },
    select: { id: true, image: true },
  });
  if (!current) throw new AccountSecurityError("ACCOUNT_UNAVAILABLE");
  if (!current.image) return { image: null };

  await prisma.$transaction(async (tx) => {
    const updated = await tx.user.updateMany({
      where: { id: current.id, isActive: true, image: current.image },
      data: { image: null },
    });
    if (updated.count !== 1) throw new AccountSecurityError("PROFILE_CONFLICT");
    await registerAuditLog({
      actorUserId: current.id,
      tenantId: null,
      action: AuditAction.AVATAR_REMOVED,
      targetType: "User",
      targetId: current.id,
      origin: input.origin ?? "api",
      metadata: { storageCleanupRequested: true },
    }, tx);
  });

  await cleanupOwnedAvatar(current.image, current.id).catch(() => undefined);
  return { image: null };
}