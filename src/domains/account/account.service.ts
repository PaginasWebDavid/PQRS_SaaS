import { AuditAction } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { registerAuditLog } from "@/domains/platform/audit.service";
import {
  AccountSecurityError,
  generatePasswordResetToken,
  hashPasswordResetToken,
  normalizeAccountEmail,
  validateCurrentPassword,
  validateNewPassword,
} from "@/domains/account/account-security";

const BCRYPT_COST = 10;
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

type AccountSecurityTestStep = "AFTER_RESET_TOKEN_CLAIMED";
let accountSecurityTestHook: ((step: AccountSecurityTestStep) => Promise<void> | void) | null = null;

export function __unsafeSetAccountSecurityTestHook(
  hook: ((step: AccountSecurityTestStep) => Promise<void> | void) | null
) {
  if (process.env.NODE_ENV !== "test") throw new Error("ACCOUNT_TEST_HOOK_FORBIDDEN");
  accountSecurityTestHook = hook;
}

async function runAccountSecurityTestStep(step: AccountSecurityTestStep) {
  if (accountSecurityTestHook) await accountSecurityTestHook(step);
}

export const GLOBAL_USER_PUBLIC_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  image: true,
  isActive: true,
  createdAt: true,
} as const;

export async function requireActiveGlobalAccount(userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, isActive: true },
    select: { ...GLOBAL_USER_PUBLIC_SELECT, sessionVersion: true },
  });
  if (!user) throw new AccountSecurityError("ACCOUNT_UNAVAILABLE");
  return user;
}

export async function changeGlobalPassword(input: {
  userId: string;
  currentPassword: unknown;
  newPassword: unknown;
  confirmPassword: unknown;
  origin?: string | null;
}) {
  const currentPassword = validateCurrentPassword(input.currentPassword);
  const newPassword = validateNewPassword(input.newPassword, input.confirmPassword);
  const user = await prisma.user.findFirst({
    where: { id: input.userId, isActive: true },
    select: { id: true, password: true },
  });
  if (!user) throw new AccountSecurityError("ACCOUNT_UNAVAILABLE");
  if (!(await bcrypt.compare(currentPassword, user.password))) {
    throw new AccountSecurityError("CURRENT_PASSWORD_INVALID");
  }
  if (await bcrypt.compare(newPassword, user.password)) {
    throw new AccountSecurityError("PASSWORD_REUSED");
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  const changedAt = new Date();
  await prisma.$transaction(async (tx) => {
    const updated = await tx.user.updateMany({
      where: { id: user.id, isActive: true, password: user.password },
      data: { password: passwordHash, passwordChangedAt: changedAt, sessionVersion: { increment: 1 } },
    });
    if (updated.count !== 1) throw new AccountSecurityError("CURRENT_PASSWORD_INVALID");
    await tx.session.deleteMany({ where: { userId: user.id } });
    await registerAuditLog({
      actorUserId: user.id,
      tenantId: null,
      action: AuditAction.PASSWORD_CHANGED,
      targetType: "User",
      targetId: user.id,
      origin: input.origin ?? "api",
      metadata: { sessionsRevoked: true },
    }, tx);
  });

  return { passwordChangedAt: changedAt };
}

export async function createPasswordResetRequest(emailInput: unknown) {
  const email = normalizeAccountEmail(emailInput);
  const generated = generatePasswordResetToken();
  if (!email) return { delivery: null };

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, isActive: true },
  });
  if (!user?.isActive) return { delivery: null };

  const expires = new Date(Date.now() + RESET_TOKEN_TTL_MS);
  await prisma.$transaction(async (tx) => {
    await tx.verificationToken.deleteMany({ where: { identifier: user.email } });
    await tx.verificationToken.create({
      data: { identifier: user.email, token: generated.tokenHash, expires },
    });
    await registerAuditLog({
      actorUserId: user.id,
      tenantId: null,
      action: AuditAction.PASSWORD_RESET_REQUESTED,
      targetType: "User",
      targetId: user.id,
      metadata: { expiresAt: expires.toISOString() },
    }, tx);
  });

  return {
    delivery: {
      recipient: user.email,
      name: user.name,
      token: generated.token,
      expires,
    },
  };
}

export async function resetGlobalPassword(input: {
  token: unknown;
  newPassword: unknown;
  confirmPassword: unknown;
  origin?: string | null;
}) {
  const tokenHash = hashPasswordResetToken(input.token);
  const newPassword = validateNewPassword(input.newPassword, input.confirmPassword);
  const now = new Date();
  const verification = await prisma.verificationToken.findUnique({
    where: { token: tokenHash },
  });
  if (!verification || verification.expires <= now) {
    if (verification) await prisma.verificationToken.deleteMany({ where: { token: tokenHash } });
    throw new AccountSecurityError("RESET_TOKEN_INVALID");
  }

  const user = await prisma.user.findUnique({
    where: { email: verification.identifier },
    select: { id: true, password: true, isActive: true },
  });
  if (!user?.isActive) throw new AccountSecurityError("RESET_TOKEN_INVALID");
  if (await bcrypt.compare(newPassword, user.password)) {
    throw new AccountSecurityError("PASSWORD_REUSED");
  }
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.verificationToken.deleteMany({
      where: { token: tokenHash, identifier: verification.identifier, expires: { gt: now } },
    });
    if (claimed.count !== 1) throw new AccountSecurityError("RESET_TOKEN_INVALID");
    await runAccountSecurityTestStep("AFTER_RESET_TOKEN_CLAIMED");

    const updated = await tx.user.updateMany({
      where: { id: user.id, isActive: true, password: user.password },
      data: { password: passwordHash, passwordChangedAt: now, sessionVersion: { increment: 1 } },
    });
    if (updated.count !== 1) throw new AccountSecurityError("RESET_TOKEN_INVALID");
    await tx.session.deleteMany({ where: { userId: user.id } });
    await registerAuditLog({
      actorUserId: user.id,
      tenantId: null,
      action: AuditAction.PASSWORD_RESET_COMPLETED,
      targetType: "User",
      targetId: user.id,
      origin: input.origin ?? "api",
      metadata: { sessionsRevoked: true },
    }, tx);
  });

  return { passwordChangedAt: now };
}