import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

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

export async function sendEmail({ to, subject, html, attachments }: SendEmailOptions) {
  return transporter.sendMail({
    from: `"Conjunto Parque Calle 100" <${process.env.SMTP_USER || "ingridasaf@gmail.com"}>`,
    to,
    subject,
    html,
    attachments,
  });
}
