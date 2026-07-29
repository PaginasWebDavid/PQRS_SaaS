import {
  AuditAction,
  BillingOutboxAttemptStatus,
  BillingOutboxChannel,
  BillingOutboxEventType,
  BillingOutboxStatus,
  EmailLogStatus,
  Prisma,
  type BillingNotificationOutbox,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { registerAuditLog } from "@/domains/platform/audit.service";
import {
  createNotificationIdempotent,
  NotificationRecipientUnavailableError,
} from "@/domains/notifications/notification.service";
import { renderEmailLayout, sendBillingOutboxEmail } from "@/lib/email";
import {
  BILLING_OUTBOX_BATCH_LIMIT,
  BILLING_OUTBOX_LEASE_MS,
  buildBillingOutboxDedupeKey,
  classifyLocalOutboxError,
  computeBillingOutboxNextAttemptAt,
  decideAbandonedBillingOutbox,
  getBillingOutboxContent,
  hasBillingOutboxAttemptsRemaining,
  sanitizeBillingOutboxPayload,
  sanitizeOutboxErrorCode,
  type BillingFailureStatus,
} from "./billing-outbox-policy";

export type BillingOutboxTestStep =
  | "AFTER_OUTBOX_CREATED"
  | "AFTER_OUTBOX_SELECTED"
  | "AFTER_OUTBOX_CLAIMED"
  | "BEFORE_NOTIFICATION_CREATE"
  | "AFTER_NOTIFICATION_CREATE"
  | "BEFORE_EMAIL_PROVIDER_ATTEMPT"
  // Se ejecuta DESPUES de confirmar `providerAttemptStartedAt` (transaccion del
  // marcador ya comprometida) y ANTES de cualquier fetch al proveedor. Permite a
  // una prueba provocar la ventana "frontera cruzada, pero el envio nunca ocurrio".
  | "AFTER_EMAIL_PROVIDER_ATTEMPT_MARKED"
  | "AFTER_EMAIL_PROVIDER_RESPONSE"
  | "BEFORE_OUTBOX_FINALIZE";

type BillingOutboxStepContext = { outboxId?: string; tenantId?: string; outboxIds?: string[] };
type BillingOutboxTestHooks = {
  onStep?: (step: BillingOutboxTestStep, context: BillingOutboxStepContext) => void | Promise<void>;
};
let billingOutboxTestHooks: BillingOutboxTestHooks = {};

/** Test-only seam. Production ignores hooks even if this function was imported. */
export function __unsafeSetBillingOutboxTestHooks(hooks: BillingOutboxTestHooks) {
  billingOutboxTestHooks = hooks;
}

export function __unsafeResetBillingOutboxTestHooks() {
  billingOutboxTestHooks = {};
}

async function runOutboxStep(step: BillingOutboxTestStep, context: BillingOutboxStepContext = {}) {
  if (process.env.NODE_ENV === "test" && billingOutboxTestHooks.onStep) {
    await billingOutboxTestHooks.onStep(step, context);
  }
}

export interface BillingOutboxCreationSummary {
  activeRecipients: number;
  planned: number;
  created: number;
  noActiveRecipients: boolean;
}

export async function createBillingOutboxIntentsForTransition(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    subscriptionId: string;
    eventType: BillingOutboxEventType;
    boundary: Date;
    graceDays?: number | null;
    periodEndsAt?: Date | null;
  }
): Promise<BillingOutboxCreationSummary> {
  const recipients = await tx.tenantMembership.findMany({
    where: { tenantId: input.tenantId, role: "ADMIN", isActive: true, user: { isActive: true } },
    select: { userId: true },
    orderBy: { userId: "asc" },
  });
  if (recipients.length === 0) {
    return { activeRecipients: 0, planned: 0, created: 0, noActiveRecipients: true };
  }

  const payload = sanitizeBillingOutboxPayload({ graceDays: input.graceDays, periodEndsAt: input.periodEndsAt });
  const rows = recipients.flatMap((recipient) =>
    ([BillingOutboxChannel.IN_APP, BillingOutboxChannel.EMAIL] as const).map((channel) => ({
      tenantId: input.tenantId,
      subscriptionId: input.subscriptionId,
      recipientUserId: recipient.userId,
      channel,
      eventType: input.eventType,
      dedupeKey: buildBillingOutboxDedupeKey({
        subscriptionId: input.subscriptionId,
        eventType: input.eventType,
        boundary: input.boundary,
        recipientUserId: recipient.userId,
        channel,
      }),
      payload: payload as unknown as Prisma.InputJsonValue,
    }))
  );

  const inserted = await tx.billingNotificationOutbox.createMany({ data: rows, skipDuplicates: true });
  const createdRows = await tx.billingNotificationOutbox.findMany({
    where: { dedupeKey: { in: rows.map((row) => row.dedupeKey) } },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  await runOutboxStep("AFTER_OUTBOX_CREATED", {
    tenantId: input.tenantId,
    outboxIds: createdRows.map((row) => row.id),
  });

  return {
    activeRecipients: recipients.length,
    planned: rows.length,
    created: inserted.count,
    noActiveRecipients: false,
  };
}

export type BillingOutboxErrorDetail = {
  stage: "RECOVERY" | "CLAIM" | "RECIPIENT" | "IN_APP" | "EMAIL" | "FINALIZE";
  outboxId: string;
  channel: BillingOutboxChannel;
  errorCode: string;
};

export interface BillingOutboxDispatchSummary {
  eligible: number;
  claimed: number;
  processed: number;
  completedInApp: number;
  completedEmail: number;
  internalDuplicates: number;
  skippedConcurrentClaim: number;
  retriesScheduled: number;
  failedFinal: number;
  deliveryUnknown: number;
  noValidRecipient: number;
  providerAttempts: number;
  inAppAttempts: number;
  emailAttempts: number;
  notificationTenantsAttempted: number;
  errors: number;
  errorDetailsTruncated: boolean;
  errorDetails: BillingOutboxErrorDetail[];
}

export function emptyBillingOutboxDispatchSummary(): BillingOutboxDispatchSummary {
  return {
    eligible: 0,
    claimed: 0,
    processed: 0,
    completedInApp: 0,
    completedEmail: 0,
    internalDuplicates: 0,
    skippedConcurrentClaim: 0,
    retriesScheduled: 0,
    failedFinal: 0,
    deliveryUnknown: 0,
    noValidRecipient: 0,
    providerAttempts: 0,
    inAppAttempts: 0,
    emailAttempts: 0,
    notificationTenantsAttempted: 0,
    errors: 0,
    errorDetailsTruncated: false,
    errorDetails: [],
  };
}

const OUTBOX_ERROR_DETAIL_LIMIT = 50;

function recordDispatchError(
  summary: BillingOutboxDispatchSummary,
  detail: BillingOutboxErrorDetail
) {
  summary.errors += 1;
  if (summary.errorDetails.length < OUTBOX_ERROR_DETAIL_LIMIT) summary.errorDetails.push(detail);
  else summary.errorDetailsTruncated = true;
}

function classifyDatabaseError(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return sanitizeOutboxErrorCode(`PRISMA_${error.code}`);
  if (error instanceof NotificationRecipientUnavailableError) return error.code;
  if (error instanceof Error) return sanitizeOutboxErrorCode(error.name);
  return "UNKNOWN_ERROR";
}

async function recoverAbandonedRows({
  now,
  tenantIds,
  summary,
}: {
  now: Date;
  tenantIds?: string[];
  summary: BillingOutboxDispatchSummary;
}) {
  const leaseCutoff = new Date(now.getTime() - BILLING_OUTBOX_LEASE_MS);
  const staleRows = await prisma.billingNotificationOutbox.findMany({
    where: {
      status: BillingOutboxStatus.PROCESSING,
      lockedAt: { lte: leaseCutoff },
      ...(tenantIds ? { tenantId: { in: tenantIds } } : {}),
    },
    orderBy: [{ lockedAt: "asc" }, { id: "asc" }],
    take: BILLING_OUTBOX_BATCH_LIMIT,
  });

  for (const row of staleRows) {
    const recovery = decideAbandonedBillingOutbox({
      channel: row.channel,
      providerAttemptStartedAt: row.providerAttemptStartedAt,
    });
    if (recovery === "DELIVERY_UNKNOWN") {
      const changed = await prisma.$transaction(async (tx) => {
        const updated = await tx.billingNotificationOutbox.updateMany({
          where: {
            id: row.id,
            status: BillingOutboxStatus.PROCESSING,
            attemptCount: row.attemptCount,
            lockedAt: row.lockedAt,
            providerAttemptStartedAt: row.providerAttemptStartedAt,
          },
          data: {
            status: BillingOutboxStatus.DELIVERY_UNKNOWN,
            processedAt: now,
            lockedAt: null,
            lastErrorCode: "ABANDONED_AFTER_PROVIDER_START",
          },
        });
        if (updated.count !== 1) return false;
        await tx.billingOutboxAttempt.updateMany({
          where: { outboxId: row.id, attemptNumber: row.attemptCount, status: BillingOutboxAttemptStatus.STARTED },
          data: {
            status: BillingOutboxAttemptStatus.DELIVERY_UNKNOWN,
            errorCode: "ABANDONED_AFTER_PROVIDER_START",
            finishedAt: now,
          },
        });
        await tx.emailLog.updateMany({
          where: { outboxId: row.id, status: EmailLogStatus.PROCESSING },
          data: {
            status: EmailLogStatus.DELIVERY_UNKNOWN,
            lastErrorCode: "ABANDONED_AFTER_PROVIDER_START",
          },
        });
        return true;
      });
      if (changed) {
        summary.eligible += 1;
        summary.processed += 1;
        summary.deliveryUnknown += 1;
        recordDispatchError(summary, {
          stage: "RECOVERY",
          outboxId: row.id,
          channel: row.channel,
          errorCode: "ABANDONED_AFTER_PROVIDER_START",
        });
      }
      continue;
    }

    await prisma.$transaction(async (tx) => {
      const updated = await tx.billingNotificationOutbox.updateMany({
        where: {
          id: row.id,
          status: BillingOutboxStatus.PROCESSING,
          attemptCount: row.attemptCount,
          lockedAt: row.lockedAt,
          providerAttemptStartedAt: null,
        },
        data: {
          status: BillingOutboxStatus.PENDING,
          nextAttemptAt: now,
          lockedAt: null,
          processingStartedAt: null,
          lastErrorCode: "ABANDONED_BEFORE_PROVIDER_START",
        },
      });
      if (updated.count !== 1) return;
      await tx.billingOutboxAttempt.updateMany({
        where: { outboxId: row.id, attemptNumber: row.attemptCount, status: BillingOutboxAttemptStatus.STARTED },
        data: {
          status: BillingOutboxAttemptStatus.FAILED_RETRYABLE,
          errorCode: "ABANDONED_BEFORE_PROVIDER_START",
          finishedAt: now,
        },
      });
    }).catch((error) => {
      recordDispatchError(summary, {
        stage: "RECOVERY",
        outboxId: row.id,
        channel: row.channel,
        errorCode: classifyDatabaseError(error),
      });
    });
  }
}

async function claimOutboxRow(row: BillingNotificationOutbox, now: Date) {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.billingNotificationOutbox.updateMany({
      where: {
        id: row.id,
        status: row.status,
        attemptCount: row.attemptCount,
        lockedAt: row.lockedAt,
        nextAttemptAt: row.nextAttemptAt,
      },
      data: {
        status: BillingOutboxStatus.PROCESSING,
        attemptCount: { increment: 1 },
        lockedAt: now,
        processingStartedAt: now,
        providerAttemptStartedAt: null,
        processedAt: null,
        lastErrorCode: null,
      },
    });
    if (claimed.count !== 1) return null;
    const attemptNumber = row.attemptCount + 1;
    await tx.billingOutboxAttempt.create({
      data: {
        outboxId: row.id,
        attemptNumber,
        status: BillingOutboxAttemptStatus.STARTED,
        startedAt: now,
      },
    });
    return tx.billingNotificationOutbox.findUniqueOrThrow({ where: { id: row.id } });
  });
}

async function finalizeFailure({
  row,
  requestedStatus,
  errorCode,
  now,
  summary,
  noValidRecipient = false,
}: {
  row: BillingNotificationOutbox;
  requestedStatus: BillingFailureStatus;
  errorCode: string;
  now: Date;
  summary: BillingOutboxDispatchSummary;
  noValidRecipient?: boolean;
}) {
  const code = sanitizeOutboxErrorCode(errorCode);
  const status = requestedStatus === BillingOutboxStatus.FAILED_RETRYABLE && !hasBillingOutboxAttemptsRemaining(row.attemptCount)
    ? BillingOutboxStatus.FAILED_FINAL
    : requestedStatus;
  const retryable = status === BillingOutboxStatus.FAILED_RETRYABLE;
  const attemptStatus = status as BillingOutboxAttemptStatus;

  await runOutboxStep("BEFORE_OUTBOX_FINALIZE", { outboxId: row.id, tenantId: row.tenantId });
  const changed = await prisma.$transaction(async (tx) => {
    const updated = await tx.billingNotificationOutbox.updateMany({
      where: { id: row.id, status: BillingOutboxStatus.PROCESSING, attemptCount: row.attemptCount },
      data: {
        status,
        nextAttemptAt: retryable ? computeBillingOutboxNextAttemptAt(now, row.attemptCount) : row.nextAttemptAt,
        lockedAt: null,
        processedAt: retryable ? null : now,
        lastErrorCode: code,
      },
    });
    if (updated.count !== 1) return false;
    await tx.billingOutboxAttempt.update({
      where: { outboxId_attemptNumber: { outboxId: row.id, attemptNumber: row.attemptCount } },
      data: { status: attemptStatus, errorCode: code, finishedAt: now },
    });
    if (row.channel === BillingOutboxChannel.EMAIL) {
      await tx.emailLog.updateMany({
        where: { outboxId: row.id },
        data: {
          status: status as EmailLogStatus,
          lastErrorCode: code,
          errorMessage: null,
        },
      });
      if (!retryable) {
        await registerAuditLog({
          tenantId: row.tenantId,
          action: AuditAction.EMAIL_FAILED,
          targetType: "BillingNotificationOutbox",
          targetId: row.id,
          metadata: { channel: row.channel, status, errorCode: code },
        }, tx);
      }
    }
    return true;
  });
  if (!changed) {
    summary.skippedConcurrentClaim += 1;
    return;
  }
  summary.processed += 1;
  if (retryable) summary.retriesScheduled += 1;
  else if (status === BillingOutboxStatus.DELIVERY_UNKNOWN) summary.deliveryUnknown += 1;
  else summary.failedFinal += 1;
  if (noValidRecipient) summary.noValidRecipient += 1;
  recordDispatchError(summary, {
    stage: noValidRecipient ? "RECIPIENT" : row.channel === BillingOutboxChannel.IN_APP ? "IN_APP" : "EMAIL",
    outboxId: row.id,
    channel: row.channel,
    errorCode: code,
  });
}

async function processInAppRow(
  row: BillingNotificationOutbox,
  summary: BillingOutboxDispatchSummary,
  now: Date
) {
  const content = getBillingOutboxContent(row.eventType, row.payload as unknown as { version: 1; graceDays?: number });
  await runOutboxStep("BEFORE_NOTIFICATION_CREATE", { outboxId: row.id, tenantId: row.tenantId });
  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.billingNotificationOutbox.findFirst({
      where: { id: row.id, status: BillingOutboxStatus.PROCESSING, attemptCount: row.attemptCount },
      select: { id: true },
    });
    if (!current || !row.recipientUserId) throw new NotificationRecipientUnavailableError();
    const notification = await createNotificationIdempotent({
      tenantId: row.tenantId,
      userId: row.recipientUserId,
      type: content.notificationType,
      title: content.title,
      message: content.message,
      resourceType: "Subscription",
      resourceId: row.subscriptionId,
      dedupeKey: row.dedupeKey,
    }, tx);
    await runOutboxStep("AFTER_NOTIFICATION_CREATE", { outboxId: row.id, tenantId: row.tenantId });
    await runOutboxStep("BEFORE_OUTBOX_FINALIZE", { outboxId: row.id, tenantId: row.tenantId });
    const completed = await tx.billingNotificationOutbox.updateMany({
      where: { id: row.id, status: BillingOutboxStatus.PROCESSING, attemptCount: row.attemptCount },
      data: {
        status: BillingOutboxStatus.COMPLETED,
        processedAt: now,
        lockedAt: null,
        lastErrorCode: null,
      },
    });
    if (completed.count !== 1) throw new Error("OUTBOX_FINALIZE_CAS_LOST");
    await tx.billingOutboxAttempt.update({
      where: { outboxId_attemptNumber: { outboxId: row.id, attemptNumber: row.attemptCount } },
      data: { status: BillingOutboxAttemptStatus.COMPLETED, finishedAt: now },
    });
    return notification;
  });
  summary.processed += 1;
  summary.completedInApp += 1;
  if (!result.created) summary.internalDuplicates += 1;
}

async function ensureEmailLog(row: BillingNotificationOutbox, recipient: string) {
  await prisma.emailLog.createMany({
    data: [{
      tenantId: row.tenantId,
      recipient,
      template: "license-status-change",
      provider: "RESEND",
      dedupeKey: row.dedupeKey,
      outboxId: row.id,
      status: EmailLogStatus.PENDING,
    }],
    skipDuplicates: true,
  });
  return prisma.emailLog.findUniqueOrThrow({ where: { outboxId: row.id } });
}

async function processEmailRow(
  row: BillingNotificationOutbox,
  recipient: string,
  summary: BillingOutboxDispatchSummary,
  now: Date
) {
  const emailLog = await ensureEmailLog(row, recipient);
  if (emailLog.status === EmailLogStatus.SENT) {
    const reconciled = await prisma.$transaction(async (tx) => {
      const updated = await tx.billingNotificationOutbox.updateMany({
        where: { id: row.id, status: BillingOutboxStatus.PROCESSING, attemptCount: row.attemptCount },
        data: { status: BillingOutboxStatus.COMPLETED, processedAt: now, lockedAt: null },
      });
      if (updated.count !== 1) return false;
      await tx.billingOutboxAttempt.update({
        where: { outboxId_attemptNumber: { outboxId: row.id, attemptNumber: row.attemptCount } },
        data: {
          status: BillingOutboxAttemptStatus.COMPLETED,
          providerMessageId: emailLog.providerMessageId,
          finishedAt: now,
        },
      });
      return true;
    });
    if (reconciled) {
      summary.processed += 1;
      summary.completedEmail += 1;
    } else summary.skippedConcurrentClaim += 1;
    return;
  }
  if (emailLog.status === EmailLogStatus.DELIVERY_UNKNOWN || emailLog.status === EmailLogStatus.FAILED_FINAL) {
    await finalizeFailure({
      row,
      requestedStatus: emailLog.status,
      errorCode: emailLog.lastErrorCode ?? "EMAIL_LOG_TERMINAL",
      now,
      summary,
    });
    return;
  }

  const content = getBillingOutboxContent(row.eventType, row.payload as unknown as { version: 1; graceDays?: number });
  const appUrl = (process.env.NEXTAUTH_URL || process.env.APP_URL || "").replace(/\/$/, "");
  let providerAttemptStarted = false;
  try {
    const result = await sendBillingOutboxEmail({
      to: recipient,
      subject: content.title,
      html: renderEmailLayout({
        accent: content.accent,
        eyebrow: "Licencia",
        heading: content.title,
        bodyHtml: content.emailBodyHtml,
        cta: appUrl ? { label: "Ir a Licencias y pagos", url: `${appUrl}/admin/licencias` } : undefined,
      }),
      beforeProviderAttempt: async () => {
        await runOutboxStep("BEFORE_EMAIL_PROVIDER_ATTEMPT", { outboxId: row.id, tenantId: row.tenantId });
        const startedAt = new Date();
        const marked = await prisma.$transaction(async (tx) => {
          const updated = await tx.billingNotificationOutbox.updateMany({
            where: {
              id: row.id,
              status: BillingOutboxStatus.PROCESSING,
              attemptCount: row.attemptCount,
              providerAttemptStartedAt: null,
            },
            data: { providerAttemptStartedAt: startedAt },
          });
          if (updated.count !== 1) return false;
          await tx.emailLog.update({
            where: { id: emailLog.id },
            data: {
              status: EmailLogStatus.PROCESSING,
              attemptCount: { increment: 1 },
              lastAttemptAt: startedAt,
              lastErrorCode: null,
              errorMessage: null,
            },
          });
          return true;
        });
        if (!marked) throw new Error("OUTBOX_PROVIDER_MARKER_CAS_LOST");
        providerAttemptStarted = true;
        summary.providerAttempts += 1;
        // Frontera cruzada y confirmada; el fetch aun no ocurrio.
        await runOutboxStep("AFTER_EMAIL_PROVIDER_ATTEMPT_MARKED", { outboxId: row.id, tenantId: row.tenantId });
      },
    });

    await runOutboxStep("AFTER_EMAIL_PROVIDER_RESPONSE", { outboxId: row.id, tenantId: row.tenantId });
    if (result.status !== "SENT") {
      await finalizeFailure({
        row,
        requestedStatus: result.status,
        errorCode: result.errorCode,
        now,
        summary,
      });
      return;
    }

    await runOutboxStep("BEFORE_OUTBOX_FINALIZE", { outboxId: row.id, tenantId: row.tenantId });
    const completed = await prisma.$transaction(async (tx) => {
      const updated = await tx.billingNotificationOutbox.updateMany({
        where: { id: row.id, status: BillingOutboxStatus.PROCESSING, attemptCount: row.attemptCount },
        data: {
          status: BillingOutboxStatus.COMPLETED,
          processedAt: now,
          lockedAt: null,
          lastErrorCode: null,
        },
      });
      if (updated.count !== 1) return false;
      await tx.billingOutboxAttempt.update({
        where: { outboxId_attemptNumber: { outboxId: row.id, attemptNumber: row.attemptCount } },
        data: {
          status: BillingOutboxAttemptStatus.COMPLETED,
          providerMessageId: result.providerMessageId,
          finishedAt: now,
        },
      });
      await tx.emailLog.update({
        where: { id: emailLog.id },
        data: {
          status: EmailLogStatus.SENT,
          providerMessageId: result.providerMessageId,
          sentAt: now,
          lastErrorCode: null,
          errorMessage: null,
        },
      });
      await registerAuditLog({
        tenantId: row.tenantId,
        action: AuditAction.EMAIL_SENT,
        targetType: "EmailLog",
        targetId: emailLog.id,
        metadata: { template: emailLog.template, provider: "RESEND", outboxId: row.id },
      }, tx);
      return true;
    });
    if (!completed) throw new Error("OUTBOX_FINALIZE_CAS_LOST");
    summary.processed += 1;
    summary.completedEmail += 1;
  } catch (error) {
    if (providerAttemptStarted) {
      recordDispatchError(summary, {
        stage: "FINALIZE",
        outboxId: row.id,
        channel: row.channel,
        errorCode: classifyDatabaseError(error),
      });
      return;
    }
    await finalizeFailure({
      row,
      requestedStatus: classifyLocalOutboxError({
        code: classifyDatabaseError(error),
        providerAttemptStarted: false,
      }),
      errorCode: classifyDatabaseError(error),
      now,
      summary,
    });
  }
}

export async function dispatchBillingOutbox(options: {
  tenantIds?: string[];
  now?: Date;
  batchLimit?: number;
} = {}): Promise<BillingOutboxDispatchSummary> {
  const now = options.now ?? new Date();
  const batchLimit = options.batchLimit ?? BILLING_OUTBOX_BATCH_LIMIT;
  if ((options.now || options.batchLimit !== undefined) && process.env.NODE_ENV !== "test") {
    throw new Error("Outbox time and batch overrides are test-only");
  }
  if (!Number.isSafeInteger(batchLimit) || batchLimit < 1 || batchLimit > BILLING_OUTBOX_BATCH_LIMIT) {
    throw new RangeError(`batchLimit must be between 1 and ${BILLING_OUTBOX_BATCH_LIMIT}`);
  }

  const summary = emptyBillingOutboxDispatchSummary();
  await recoverAbandonedRows({ now, tenantIds: options.tenantIds, summary });
  const candidates = await prisma.billingNotificationOutbox.findMany({
    where: {
      status: { in: [BillingOutboxStatus.PENDING, BillingOutboxStatus.FAILED_RETRYABLE] },
      nextAttemptAt: { lte: now },
      ...(options.tenantIds ? { tenantId: { in: options.tenantIds } } : {}),
    },
    orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    take: batchLimit,
  });
  summary.eligible += candidates.length;
  await runOutboxStep("AFTER_OUTBOX_SELECTED", { outboxIds: candidates.map((row) => row.id) });
  const notificationTenants = new Set<string>();

  for (const candidate of candidates) {
    let row: BillingNotificationOutbox | null = null;
    try {
      row = await claimOutboxRow(candidate, now);
      if (!row) {
        summary.skippedConcurrentClaim += 1;
        continue;
      }
      summary.claimed += 1;
      if (row.channel === BillingOutboxChannel.IN_APP) {
        summary.inAppAttempts += 1;
        notificationTenants.add(row.tenantId);
      } else summary.emailAttempts += 1;
      await runOutboxStep("AFTER_OUTBOX_CLAIMED", { outboxId: row.id, tenantId: row.tenantId });

      const recipient = row.recipientUserId
        ? await prisma.tenantMembership.findFirst({
            where: { userId: row.recipientUserId, tenantId: row.tenantId, isActive: true, user: { isActive: true } },
            select: { user: { select: { email: true } } },
          })
        : null;
      if (!recipient) {
        await finalizeFailure({
          row,
          requestedStatus: BillingOutboxStatus.FAILED_FINAL,
          errorCode: "RECIPIENT_UNAVAILABLE",
          now,
          summary,
          noValidRecipient: true,
        });
        continue;
      }

      if (row.channel === BillingOutboxChannel.IN_APP) {
        await processInAppRow(row, summary, now);
      } else {
        await processEmailRow(row, recipient.user.email, summary, now);
      }
    } catch (error) {
      if (row) {
        const current = await prisma.billingNotificationOutbox.findUnique({ where: { id: row.id } }).catch(() => null);
        let finalized = false;
        if (current?.status === BillingOutboxStatus.PROCESSING && current.providerAttemptStartedAt === null) {
          await finalizeFailure({
            row: current,
            requestedStatus: classifyLocalOutboxError({
              code: classifyDatabaseError(error),
              providerAttemptStarted: false,
            }),
            errorCode: classifyDatabaseError(error),
            now,
            summary,
          }).then(() => { finalized = true; }).catch(() => undefined);
        }
        if (!finalized) recordDispatchError(summary, {
          stage: row.channel === BillingOutboxChannel.IN_APP ? "IN_APP" : "EMAIL",
          outboxId: row.id,
          channel: row.channel,
          errorCode: classifyDatabaseError(error),
        });
      } else {
        recordDispatchError(summary, {
          stage: "CLAIM",
          outboxId: candidate.id,
          channel: candidate.channel,
          errorCode: classifyDatabaseError(error),
        });
      }
    }
  }

  summary.notificationTenantsAttempted = notificationTenants.size;
  return summary;
}