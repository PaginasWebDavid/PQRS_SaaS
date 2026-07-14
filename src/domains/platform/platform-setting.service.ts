import { AuditAction, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { registerAuditLog } from "@/domains/platform/audit.service";

const SECRET_ENV_KEYS: Record<string, string> = {
  RESEND_API_KEY: "RESEND_API_KEY",
  SUPABASE_SERVICE_ROLE_KEY: "SUPABASE_SERVICE_ROLE_KEY",
  MERCADO_PAGO_ACCESS_TOKEN: "MERCADO_PAGO_ACCESS_TOKEN",
  MERCADO_PAGO_WEBHOOK_SECRET: "MERCADO_PAGO_WEBHOOK_SECRET",
};

export function secretReference(envKey: keyof typeof SECRET_ENV_KEYS) {
  return { source: "env", key: SECRET_ENV_KEYS[envKey], configured: Boolean(process.env[SECRET_ENV_KEYS[envKey]]) };
}

export async function upsertPlatformSetting({
  key,
  value,
  isSecret = false,
  updatedById,
}: {
  key: string;
  value: Prisma.InputJsonValue;
  isSecret?: boolean;
  updatedById?: string | null;
}) {
  if (isSecret && typeof value === "string" && !value.startsWith("env:")) {
    throw new Error("Los secretos privados deben guardarse como referencia segura, no como texto plano");
  }

  const setting = await prisma.platformSetting.upsert({
    where: { key },
    update: { value, isSecret, updatedById: updatedById ?? null },
    create: { key, value, isSecret, updatedById: updatedById ?? null },
  });

  await registerAuditLog({
    actorUserId: updatedById,
    action: AuditAction.PLATFORM_SETTING_CHANGED,
    targetType: "PlatformSetting",
    targetId: setting.id,
    metadata: { key, isSecret, value: isSecret ? "[SECRET_REFERENCE]" : value },
  });

  return setting;
}

export async function listSafePlatformSettings() {
  const settings = await prisma.platformSetting.findMany({ orderBy: { key: "asc" } });
  return settings.map((setting) => ({
    id: setting.id,
    key: setting.key,
    isSecret: setting.isSecret,
    value: setting.isSecret ? { configured: true } : setting.value,
    createdAt: setting.createdAt,
    updatedAt: setting.updatedAt,
  }));
}

const DEFAULT_PLATFORM_NAME = "PQRS Services";
export const DEFAULT_PQRS_CLOSE_SLA_DAYS = 7;

export async function getGeneralSettings() {
  const settings = await prisma.platformSetting.findMany({
    where: { key: { in: ["platformName", "pqrsCloseSlaDays", "supportTicketsEnabled", "transactionalEmailEnabled"] } },
  });
  const byKey = Object.fromEntries(settings.map((s) => [s.key, s.value]));

  return {
    platformName: typeof byKey.platformName === "string" ? byKey.platformName : DEFAULT_PLATFORM_NAME,
    pqrsCloseSlaDays: typeof byKey.pqrsCloseSlaDays === "number" ? byKey.pqrsCloseSlaDays : DEFAULT_PQRS_CLOSE_SLA_DAYS,
    supportTicketsEnabled: typeof byKey.supportTicketsEnabled === "boolean" ? byKey.supportTicketsEnabled : true,
    transactionalEmailEnabled: typeof byKey.transactionalEmailEnabled === "boolean" ? byKey.transactionalEmailEnabled : true,
  };
}

export async function isFeatureEnabled(key: "supportTicketsEnabled" | "transactionalEmailEnabled") {
  const setting = await prisma.platformSetting.findUnique({ where: { key } });
  return typeof setting?.value === "boolean" ? setting.value : true;
}

export async function getIntegrationStatus() {
  return {
    resend: {
      provider: "RESEND",
      connected: Boolean(process.env.RESEND_API_KEY),
      fromEmailConfigured: Boolean(process.env.RESEND_FROM_EMAIL),
      lastVerifiedAt: null,
    },
    supabaseStorage: {
      provider: "SUPABASE",
      connected: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_STORAGE_BUCKET),
      lastVerifiedAt: null,
    },
    mercadoPago: {
      provider: "MERCADO_PAGO",
      connected: Boolean(process.env.MERCADO_PAGO_ACCESS_TOKEN),
      webhookSecretConfigured: Boolean(process.env.MERCADO_PAGO_WEBHOOK_SECRET),
      lastVerifiedAt: null,
    },
  };
}
