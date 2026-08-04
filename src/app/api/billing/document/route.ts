import { NextRequest, NextResponse } from "next/server";
import { AuditAction, PaymentStatus } from "@prisma/client";
import jsPDF from "jspdf";
import { autoTable } from "jspdf-autotable";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertSessionClaimsCurrent, AuthorizationError, requireAuthenticatedUser } from "@/lib/authorization";
import { getAuthorizationErrorResponse } from "@/lib/authorization-response";
import { registerAuditLog } from "@/domains/platform/audit.service";
import { getLegalConfig } from "@/lib/legal";

export const runtime = "nodejs";

const NAVY: [number, number, number] = [18, 37, 69];
const MUTED: [number, number, number] = [110, 110, 115];
const SUCCESS: [number, number, number] = [26, 107, 58];
const WARNING: [number, number, number] = [138, 90, 0];
const DANGER: [number, number, number] = [179, 38, 30];

function formatMoney(amountCents: number, currency: string) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amountCents / 100);
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(value);
}

function paymentStatusLabel(status?: PaymentStatus) {
  if (status === "APPROVED") return "Aprobado";
  if (status === "REJECTED") return "Rechazado";
  return "Pendiente";
}

function paymentProviderLabel(provider?: string) {
  if (provider === "WOMPI") return "Wompi";
  if (provider === "MERCADO_PAGO") return "Mercado Pago";
  if (provider === "MANUAL_TRANSFER") return "Transferencia confirmada";
  if (provider === "COURTESY") return "Cortesia";
  return "PQRS Services";
}

function safeFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .toLowerCase()
    .slice(0, 60) || "conjunto";
}

export async function GET(req: NextRequest) {
  const session = await auth();
  let identity;
  try {
    // A pending or suspended tenant retains access to its collection document.
    if (!session) throw new AuthorizationError("UNAUTHENTICATED");
    identity = await requireAuthenticatedUser(session);
    assertSessionClaimsCurrent(session, identity);
    if (!identity.tenantId || !identity.membershipId) throw new AuthorizationError("TENANT_REQUIRED");
    if (identity.role !== "ADMIN") throw new AuthorizationError("FORBIDDEN");
    if (identity.tenantStatus === "CANCELLED" || identity.subscriptionStatus === "CANCELLED") {
      throw new AuthorizationError("TENANT_INACTIVE");
    }
  } catch (error) {
    const response = getAuthorizationErrorResponse(error);
    if (response) return response;
    throw error;
  }

  const paymentId = req.nextUrl.searchParams.get("paymentId")?.trim() || null;
  if (paymentId && !/^[a-zA-Z0-9_-]{10,80}$/.test(paymentId)) {
    return NextResponse.json({ error: "Documento no valido" }, { status: 400 });
  }

  const [tenant, user] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: identity.tenantId },
      select: {
        name: true,
        city: true,
        address: true,
        units: true,
        subscription: {
          select: {
            id: true,
            unitsSnapshot: true,
            priceCents: true,
            currency: true,
            currentPeriodStart: true,
            currentPeriodEnd: true,
          },
        },
      },
    }),
    prisma.user.findUnique({
      where: { id: identity.userId },
      select: { name: true, email: true },
    }),
  ]);

  if (!tenant?.subscription) {
    return NextResponse.json({ error: "No se encontro la licencia del conjunto" }, { status: 404 });
  }

  const payment = paymentId
    ? await prisma.payment.findFirst({
      where: {
        id: paymentId,
        tenantId: identity.tenantId,
        subscriptionId: tenant.subscription.id,
      },
      select: {
        id: true,
        amountCents: true,
        currency: true,
        status: true,
        provider: true,
        dueDate: true,
        paidAt: true,
        periodStart: true,
        periodEnd: true,
        externalReference: true,
        wompiTransactionId: true,
        mercadoPagoPaymentId: true,
      },
    })
    : null;

  if (paymentId && !payment) {
    return NextResponse.json({ error: "No se encontro el pago solicitado" }, { status: 404 });
  }

  const legal = getLegalConfig();
  const amountCents = payment?.amountCents ?? tenant.subscription.priceCents;
  const currency = payment?.currency ?? tenant.subscription.currency;
  const periodStart = payment?.periodStart ?? tenant.subscription.currentPeriodStart;
  const periodEnd = payment?.periodEnd ?? tenant.subscription.currentPeriodEnd;
  const isApproved = payment?.status === "APPROVED";
  const isRejected = payment?.status === "REJECTED";
  const title = isApproved ? "COMPROBANTE DE PAGO" : isRejected ? "RESULTADO DE PAGO" : "RESUMEN DE LICENCIA";
  const referenceSource = payment?.externalReference || payment?.id || tenant.subscription.id;
  const documentReference = `PQRS-${referenceSource.slice(-8).toUpperCase()}-${new Date().toISOString().slice(0, 7).replace("-", "")}`;
  const generatedAt = new Date();

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 42;

  doc.setFillColor(...NAVY);
  doc.roundedRect(margin, 32, 32, 32, 7, 7, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("PQ", margin + 16, 53, { align: "center" });
  doc.setTextColor(...NAVY);
  doc.setFontSize(15);
  doc.text("PQRS Services", margin + 42, 53);

  doc.setFontSize(18);
  doc.text(title, pageWidth - margin, 48, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(`Referencia: ${documentReference}`, pageWidth - margin, 65, { align: "right" });
  doc.text(`Emitido: ${formatDate(generatedAt)}`, pageWidth - margin, 79, { align: "right" });

  doc.setDrawColor(232, 232, 237);
  doc.line(margin, 102, pageWidth - margin, 102);

  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("PRESTADOR DEL SERVICIO", margin, 126);
  doc.text("CONJUNTO CONTRATANTE", pageWidth / 2 + 12, 126);
  doc.setTextColor(29, 29, 31);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  const sellerLines = [
    legal.legalName || legal.brandName,
    legal.nit ? `NIT: ${legal.nit}` : null,
    legal.address || null,
    legal.city,
    legal.supportEmail,
  ].filter(Boolean) as string[];
  const customerLines = [
    tenant.name,
    tenant.address || null,
    tenant.city || null,
    `${tenant.units || tenant.subscription.unitsSnapshot} unidades registradas`,
    user ? `Administradora: ${user.name} (${user.email})` : null,
  ].filter(Boolean) as string[];

  sellerLines.forEach((line, index) => doc.text(line, margin, 145 + index * 14));
  customerLines.forEach((line, index) => doc.text(line, pageWidth / 2 + 12, 145 + index * 14));

  autoTable(doc, {
    startY: 230,
    margin: { left: margin, right: margin },
    head: [["Concepto", "Periodo", "Unidades", "Valor"]],
    body: [[
      "Licencia mensual PQRS Services",
      `${formatDate(periodStart)} al ${formatDate(periodEnd)}`,
      String(tenant.subscription.unitsSnapshot),
      formatMoney(amountCents, currency),
    ]],
    headStyles: { fillColor: NAVY, textColor: 255, fontSize: 9, fontStyle: "bold" },
    bodyStyles: { fontSize: 9, textColor: [29, 29, 31] },
    columnStyles: {
      0: { cellWidth: 180 },
      1: { cellWidth: 190 },
      2: { cellWidth: 72, halign: "center" },
      3: { cellWidth: 80, halign: "right" },
    },
    theme: "grid",
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cursorY = (doc as any).lastAutoTable.finalY + 28;
  doc.setFillColor(245, 245, 247);
  doc.roundedRect(pageWidth - margin - 210, cursorY - 16, 210, 52, 8, 8, "F");
  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("TOTAL", pageWidth - margin - 192, cursorY + 2);
  doc.setTextColor(...NAVY);
  doc.setFontSize(16);
  doc.text(formatMoney(amountCents, currency), pageWidth - margin - 18, cursorY + 4, { align: "right" });

  cursorY += 68;
  if (payment) {
    const statusColor = payment.status === "APPROVED" ? SUCCESS : payment.status === "REJECTED" ? DANGER : WARNING;
    const transactionReference = payment.wompiTransactionId || payment.mercadoPagoPaymentId || payment.externalReference || "Pendiente de asignacion";
    doc.setTextColor(...NAVY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("DETALLE DEL PAGO", margin, cursorY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(29, 29, 31);
    doc.text(`Medio: ${paymentProviderLabel(payment.provider)}`, margin, cursorY + 18);
    doc.text(`Referencia del pago: ${transactionReference}`, margin, cursorY + 34);
    doc.text(`Fecha: ${formatDate(payment.paidAt || payment.dueDate)}`, margin, cursorY + 50);
    doc.setTextColor(...statusColor);
    doc.setFont("helvetica", "bold");
    doc.text(`Estado: ${paymentStatusLabel(payment.status)}`, margin, cursorY + 66);
    cursorY += 94;
  }

  doc.setDrawColor(232, 232, 237);
  doc.line(margin, cursorY, pageWidth - margin, cursorY);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MUTED);
  doc.setFontSize(8.5);
  const note = isApproved
    ? "Este comprobante acredita el resultado registrado del pago en PQRS Services. Conserva la referencia para soporte."
    : isRejected
      ? "Este documento confirma que el intento de pago fue rechazado. Puedes iniciar un nuevo pago desde la plataforma."
      : "Este resumen muestra el valor y periodo de la licencia. El acceso se actualiza cuando el proveedor confirma el pago.";
  doc.text(doc.splitTextToSize(note, pageWidth - margin * 2), margin, cursorY + 18);
  doc.setFontSize(7.5);
  doc.text("Generado desde tu cuenta de PQRS Services.", margin, pageHeight - 30);
  doc.text("PQRS Services", pageWidth - margin, pageHeight - 30, { align: "right" });

  const filePrefix = isApproved ? "comprobante-pago" : isRejected ? "pago-rechazado" : "resumen-licencia";
  const fileName = `${filePrefix}-${safeFileName(tenant.name)}-${documentReference.toLowerCase()}.pdf`;

  await registerAuditLog({
    actorUserId: identity.userId,
    tenantId: identity.tenantId,
    action: AuditAction.REPORT_EXPORTED,
    targetType: "BillingDocument",
    targetId: payment?.id || tenant.subscription.id,
    metadata: { documentType: isApproved ? "payment_receipt" : "collection_statement", paymentId: payment?.id || null },
  }).catch(() => null);

  return new NextResponse(new Uint8Array(doc.output("arraybuffer")), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
