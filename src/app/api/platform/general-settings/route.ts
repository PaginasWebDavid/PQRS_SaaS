import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getGeneralSettings, getIntegrationStatus, upsertPlatformSetting } from "@/domains/platform/platform-setting.service";
import { sendEmailSafe, renderEmailLayout } from "@/lib/email";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const [settings, integrations] = await Promise.all([getGeneralSettings(), getIntegrationStatus()]);
  return NextResponse.json({ settings, integrations });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const body = await req.json();

  try {
    if (body.action === "updatePlatformName") {
      if (!body.value?.trim()) {
        return NextResponse.json({ error: "El nombre no puede estar vacío" }, { status: 400 });
      }
      await upsertPlatformSetting({ key: "platformName", value: body.value.trim(), updatedById: session.user.id });
      return NextResponse.json({ ok: true });
    }
    if (body.action === "updateSlaDays") {
      const days = Number(body.value);
      if (!Number.isFinite(days) || days <= 0) {
        return NextResponse.json({ error: "El SLA debe ser un número de días mayor a cero" }, { status: 400 });
      }
      await upsertPlatformSetting({ key: "pqrsCloseSlaDays", value: days, updatedById: session.user.id });
      return NextResponse.json({ ok: true });
    }
    if (body.action === "updateFeatureFlag") {
      if (!["supportTicketsEnabled", "transactionalEmailEnabled"].includes(body.key)) {
        return NextResponse.json({ error: "Feature flag inválida" }, { status: 400 });
      }
      await upsertPlatformSetting({ key: body.key, value: Boolean(body.value), updatedById: session.user.id });
      return NextResponse.json({ ok: true });
    }
    if (body.action === "sendTestEmail") {
      const result = await sendEmailSafe({
        to: session.user.email as string,
        subject: "Correo de prueba — PQRS Services",
        html: renderEmailLayout({
          accent: "success",
          eyebrow: "Prueba",
          heading: "Resend está funcionando",
          bodyHtml: `<p>Este es un correo de prueba enviado desde <strong>Configuración → Integraciones</strong>. Si lo recibiste, tu conexión con Resend quedó bien configurada y lista para enviar correos reales.</p>`,
        }),
        template: "platform_test_email",
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.errorMessage || "No se pudo enviar el correo de prueba" }, { status: 400 });
      }
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo completar la acción";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
