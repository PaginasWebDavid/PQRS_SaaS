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
}

type ResendAttachment = {
  filename: string;
  content: string;
  content_type?: string;
};

export async function sendEmail({ to, subject, html, attachments }: SendEmailOptions) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || "PQRS Services <notificaciones@pqrs-services.com>";

  if (!apiKey) {
    throw new Error("Falta RESEND_API_KEY para enviar correos con Resend");
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

  return response.json();
}