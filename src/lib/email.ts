import { AuditAction, EmailLogStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { registerAuditLog } from "@/domains/platform/audit.service";
import { isFeatureEnabled } from "@/domains/platform/platform-setting.service";

interface Attachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  attachments?: Attachment[];
  tenantId?: string | null;
  template?: string;
}

type ResendAttachment = {
  filename: string;
  content: string;
  content_type?: string;
};

type EmailResult = {
  ok: boolean;
  providerMessageId?: string | null;
  errorMessage?: string | null;
};

async function logEmailAttempt({
  tenantId,
  recipient,
  template,
  status,
  providerMessageId,
  errorMessage,
}: {
  tenantId?: string | null;
  recipient: string;
  template: string;
  status: EmailLogStatus;
  providerMessageId?: string | null;
  errorMessage?: string | null;
}) {
  const emailLog = await prisma.emailLog.create({
    data: {
      tenantId: tenantId ?? null,
      recipient,
      template,
      provider: "RESEND",
      providerMessageId: providerMessageId ?? null,
      status,
      errorMessage: errorMessage ?? null,
      sentAt: status === "SENT" ? new Date() : null,
    },
  });

  if (status !== "SKIPPED") {
    await registerAuditLog({
      tenantId,
      action: status === "SENT" ? AuditAction.EMAIL_SENT : AuditAction.EMAIL_FAILED,
      targetType: "EmailLog",
      targetId: emailLog.id,
      metadata: {
        recipient,
        template,
        provider: "RESEND",
        status,
      },
    });
  }

  return emailLog;
}

export async function sendEmail({ to, subject, html, attachments, tenantId, template = "generic" }: SendEmailOptions) {
  const transactionalEmailEnabled = await isFeatureEnabled("transactionalEmailEnabled");
  if (!transactionalEmailEnabled) {
    return logEmailAttempt({ tenantId, recipient: to, template, status: "SKIPPED" });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || "PQRS Services <notificaciones@pqrs-services.com>";

  if (!apiKey) {
    const errorMessage = "Falta RESEND_API_KEY para enviar correos con Resend";
    await logEmailAttempt({ tenantId, recipient: to, template, status: "FAILED", errorMessage });
    throw new Error(errorMessage);
  }

  const payload: {
    from: string;
    to: string[];
    subject: string;
    html: string;
    attachments?: ResendAttachment[];
  } = {
    from,
    to: [to],
    subject,
    html,
  };

  if (attachments?.length) {
    payload.attachments = attachments.map((attachment) => ({
      filename: attachment.filename,
      content: attachment.content.toString("base64"),
      content_type: attachment.contentType,
    }));
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Error enviando correo con Resend: ${detail}`);
    }

    const data = await response.json();
    const providerMessageId = typeof data?.id === "string" ? data.id : null;
    await logEmailAttempt({ tenantId, recipient: to, template, status: "SENT", providerMessageId });
    return data;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Error desconocido enviando correo";
    await logEmailAttempt({ tenantId, recipient: to, template, status: "FAILED", errorMessage });
    throw error;
  }
}

export async function sendEmailSafe(options: SendEmailOptions): Promise<EmailResult> {
  try {
    const result = await sendEmail(options);
    return { ok: true, providerMessageId: typeof result?.id === "string" ? result.id : null };
  } catch (error) {
    return {
      ok: false,
      errorMessage: error instanceof Error ? error.message : "Error desconocido enviando correo",
    };
  }
}
