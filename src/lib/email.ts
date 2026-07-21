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
    await logEmailAttempt({ tenantId, recipient: to, template, status: "SKIPPED" });
    return { skipped: true as const };
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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const response = await fetch("https://api.resend.com/emails", {
      signal: controller.signal,
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    clearTimeout(timeout);
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Error enviando correo con Resend: ${detail}`);
    }

    const data = await response.json();
    const providerMessageId = typeof data?.id === "string" ? data.id : null;
    await logEmailAttempt({ tenantId, recipient: to, template, status: "SENT", providerMessageId });
    return data;
  } catch (error) {
    const errorMessage = error instanceof Error && error.name === "AbortError"
      ? "Tiempo de espera agotado enviando correo con Resend"
      : error instanceof Error ? error.message : "Error desconocido enviando correo";
    await logEmailAttempt({ tenantId, recipient: to, template, status: "FAILED", errorMessage });
    throw error;
  }
}

type EmailAccent = "navy" | "success" | "warning" | "danger";

const ACCENT_COLORS: Record<EmailAccent, { fg: string; bg: string }> = {
  navy: { fg: "#122545", bg: "#EAEEF6" },
  success: { fg: "#1A6B3A", bg: "#ECF6EF" },
  warning: { fg: "#8A5A00", bg: "#FBF3DF" },
  danger: { fg: "#B3261E", bg: "#FBEAEA" },
};

/**
 * Shared branded HTML shell for every transactional email — keeps every
 * template (invitaciones, PQRS, soporte, contraseña) visually consistent
 * with the app's palette instead of ad-hoc inline HTML per call site.
 */
export function renderEmailLayout({
  accent = "navy",
  eyebrow,
  heading,
  bodyHtml,
  cta,
  footerNote,
}: {
  accent?: EmailAccent;
  eyebrow: string;
  heading: string;
  bodyHtml: string;
  cta?: { label: string; url: string };
  footerNote?: string;
}) {
  const { fg, bg } = ACCENT_COLORS[accent];
  return `
  <div style="background:#F5F5F7;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#FFFFFF;border-radius:20px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
      <tr>
        <td style="background:#122545;padding:26px 32px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="vertical-align:middle;padding-right:10px;">
              <svg width="24" height="24" viewBox="0 0 128 128" style="display:block;">
                <path d="M24 8h80c8.837 0 16 7.163 16 16v64c0 8.837-7.163 16-16 16H48l-16 16c-2.52 2.52-8 1.087-8-3V104c-8.837 0-16-7.163-16-16V24C8 15.163 15.163 8 24 8z" fill="#FFFFFF" />
                <path d="M40 62l17 17 31-34" fill="none" stroke="#122545" stroke-width="11" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </td>
            <td style="vertical-align:middle;">
              <span style="font-weight:800;font-size:16px;color:#FFFFFF;">PQRS <span style="font-weight:500;color:#8FA1BF;">Services</span></span>
            </td>
          </tr></table>
        </td>
      </tr>
      <tr>
        <td style="padding:36px 32px 8px;">
          <span style="display:inline-block;background:${bg};color:${fg};font-size:11px;font-weight:700;letter-spacing:0.05em;padding:5px 12px;border-radius:999px;margin-bottom:14px;">${eyebrow.toUpperCase()}</span>
          <h1 style="margin:14px 0 16px;font-size:21px;font-weight:800;color:#1D1D1F;letter-spacing:-0.02em;">${heading}</h1>
          <div style="font-size:14px;line-height:1.65;color:#3C3C43;">${bodyHtml}</div>
          ${cta ? `
          <div style="text-align:center;margin:30px 0 6px;">
            <a href="${cta.url}" style="display:inline-block;background:#122545;color:#FFFFFF;font-weight:700;font-size:14px;padding:14px 34px;border-radius:999px;text-decoration:none;">${cta.label}</a>
          </div>` : ""}
        </td>
      </tr>
      <tr>
        <td style="padding:24px 32px 32px;">
          <div style="border-top:1px solid #E5E5EA;padding-top:20px;font-size:12px;color:#8E8E93;line-height:1.6;">
            ${footerNote || "Este correo fue enviado automáticamente por PQRS Services. Por favor no respondas a este mensaje."}
          </div>
        </td>
      </tr>
    </table>
  </div>`;
}

export async function sendEmailSafe(options: SendEmailOptions): Promise<EmailResult> {
  try {
    const result = await sendEmail(options);
    if (result && typeof result === "object" && "skipped" in result && result.skipped === true) {
      return { ok: false, errorMessage: "El correo transaccional esta desactivado" };
    }
    return { ok: true, providerMessageId: typeof result?.id === "string" ? result.id : null };
  } catch (error) {
    return {
      ok: false,
      errorMessage: error instanceof Error ? error.message : "Error desconocido enviando correo",
    };
  }
}
