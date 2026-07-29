import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTenantIdFromSession } from "@/domains/organizations/tenant.service";
import { getTenantAccessResponse } from "@/lib/tenant-access-response";
import { sendEmail, renderEmailLayout } from "@/lib/email";
import { deleteFromStorage, downloadFromStorage, uploadToStorage } from "@/lib/storage";
import { AuditAction } from "@prisma/client";
import { registerAuditLog } from "@/domains/platform/audit.service";
import { createNotification, NotificationTypes } from "@/domains/notifications/notification.service";
import { isPqrsTakenByAdministration } from "@/domains/pqrs/pqrs-permissions";
import { VALID_NEXT_FASE_BY_WORKFLOW } from "@/domains/pqrs/pqrs-workflow.service";
import { toResidentPqrsView, withoutStorageUrls } from "@/domains/pqrs/resident-view";
import { pqrsCategoryVisibleLabel } from "@/domains/pqrs/pqrs-category-policy";
import {
  escapePqrsHtml,
  isRecord,
  optionalBoundedText,
  pqrsResourceScopeForUser,
  PqrsValidationError,
  residentDescriptionPatch,
  validatePqrsFile,
} from "@/domains/pqrs/pqrs-security";

const ESTADO_LABEL: Record<string, string> = {
  EN_ESPERA: "En espera",
  EN_PROGRESO: "En proceso",
  TERMINADO: "Terminado",
};

async function notifyOtherAdministrators({
  tenantId, actorUserId, pqrsId, numero,
}: { tenantId: string; actorUserId: string; pqrsId: string; numero: number }) {
  const recipients = await prisma.tenantMembership.findMany({
    where: { tenantId, role: "ADMIN", isActive: true, userId: { not: actorUserId } },
    select: { userId: true },
  });
  await Promise.allSettled(recipients.map((recipient) => createNotification({
    tenantId,
    userId: recipient.userId,
    type: NotificationTypes.PQRS_UPDATED,
    title: "PQRS actualizada",
    message: "La solicitud #" + numero + " fue actualizada por otro usuario autorizado.",
    resourceType: "Pqrs",
    resourceId: pqrsId,
  })));
}

const ALLOWED_EVIDENCE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);


async function handleGet(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (!session.user.role || session.user.role === "SUPER_ADMIN") {
    return NextResponse.json({ error: "No tiene permisos" }, { status: 403 });
  }

  const tenantAccessResponse = await getTenantAccessResponse(session);
  if (tenantAccessResponse) return tenantAccessResponse;

  const tenantId = getTenantIdFromSession(session);

  const pqrs = await prisma.pqrs.findFirst({
    where: pqrsResourceScopeForUser({
      id: params.id,
      tenantId,
      userId: session.user.id,
      role: session.user.role,
    }),
    include: {
      creadoPor: { select: { name: true, email: true } },
      gestionadoPor: { select: { name: true } },
      historial: { orderBy: { creadoAt: "asc" } },
      fotos: {
        where: { removedAt: null },
        select: { id: true, nombre: true, tipo: true, size: true, orden: true },
        orderBy: { orden: "asc" },
      },
    },
  });

  if (!pqrs) {
    return NextResponse.json({ error: "PQRS no encontrada" }, { status: 404 });
  }

  return NextResponse.json(session.user.role === "RESIDENTE" ? toResidentPqrsView(pqrs) : withoutStorageUrls(pqrs));
}

async function handlePatch(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (session.user.role !== "ADMIN" && session.user.role !== "RESIDENTE") {
    return NextResponse.json({ error: "No tiene permisos" }, { status: 403 });
  }

  const tenantAccessResponse = await getTenantAccessResponse(session);
  if (tenantAccessResponse) return tenantAccessResponse;

  const tenantId = getTenantIdFromSession(session);

  const pqrs = await prisma.pqrs.findFirst({
    where: pqrsResourceScopeForUser({
      id: params.id,
      tenantId,
      userId: session.user.id,
      role: session.user.role,
    }),
    include: { creadoPor: { select: { email: true, name: true } } },
  });

  if (!pqrs) {
    return NextResponse.json({ error: "PQRS no encontrada" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!isRecord(body)) {
    return NextResponse.json({ error: "Cuerpo invalido" }, { status: 400 });
  }

  if (session.user.role === "RESIDENTE") {
    if (isPqrsTakenByAdministration(pqrs)) {
      return NextResponse.json({ error: "La solicitud ya fue tomada por administracion y no puede editarse" }, { status: 409 });
    }
    if (pqrs.editadoPorResidente) {
      return NextResponse.json({ error: "Ya editaste esta solicitud una vez; no puede editarse de nuevo" }, { status: 409 });
    }
    let descripcion: string;
    try {
      descripcion = residentDescriptionPatch(body).descripcion;
    } catch (error) {
      const message = error instanceof PqrsValidationError ? error.message : "Datos invalidos";
      return NextResponse.json({ error: message }, { status: 400 });
    }
    // Actualizacion atomica condicionada a editadoPorResidente=false: evita que dos solicitudes
    // concurrentes pasen ambas la verificacion anterior y consuman la unica edicion permitida.
    const claimed = await prisma.pqrs.updateMany({
      where: { id: pqrs.id, tenantId, creadoPorId: session.user.id, editadoPorResidente: false },
      data: { descripcion, editadoPorResidente: true },
    });
    if (claimed.count !== 1) {
      return NextResponse.json({ error: "Ya editaste esta solicitud una vez; no puede editarse de nuevo" }, { status: 409 });
    }
    const updated = await prisma.pqrs.findFirstOrThrow({
      where: { id: pqrs.id, tenantId, creadoPorId: session.user.id },
      include: {
        historial: { orderBy: { creadoAt: "asc" } },
        fotos: {
        where: { removedAt: null },
          select: { id: true, nombre: true, tipo: true, size: true, orden: true },
          orderBy: { orden: "asc" },
        },
      },
    });
    await prisma.historialPqrs.create({
      data: { tenantId, pqrsId: pqrs.id, estadoAntes: pqrs.estado, estadoDespues: pqrs.estado, nota: "Solicitud editada por el residente antes de ser tomada" },
    });
    await registerAuditLog({
      actorUserId: session.user.id,
      tenantId,
      action: AuditAction.PQRS_UPDATED,
      targetType: "Pqrs",
      targetId: pqrs.id,
      origin: req.headers.get("x-forwarded-for") || "api",
      metadata: { fields: ["descripcion"], beforeTaken: true },
    });
    const admins = await prisma.tenantMembership.findMany({
      where: { tenantId, role: "ADMIN", isActive: true },
      select: { userId: true },
    });
    await Promise.allSettled(admins.map((admin) => createNotification({
      tenantId,
      userId: admin.userId,
      type: NotificationTypes.PQRS_UPDATED,
      title: "PQRS actualizada por residente",
      message: "La solicitud #" + pqrs.numero + " fue editada antes de su gestion.",
      resourceType: "Pqrs",
      resourceId: pqrs.id,
    })));
  return NextResponse.json(session.user.role === "RESIDENTE" ? toResidentPqrsView(updated) : withoutStorageUrls(updated));
  }

  // --- Primer contacto: EN_ESPERA a EN_PROGRESO ---
  if (body.primerContacto) {
    if (pqrs.estado !== "EN_ESPERA") {
      return NextResponse.json(
        { error: "El primer contacto ya fue registrado" },
        { status: 400 }
      );
    }

    let nota: string;
    try {
      nota = optionalBoundedText(body.notaPrimerContacto, "Nota de primer contacto", 6000) || "";
    } catch (error) {
      const message = error instanceof PqrsValidationError ? error.message : "Nota invalida";
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (!nota) {
      return NextResponse.json(
        { error: "Debe escribir una nota de primer contacto" },
        { status: 400 }
      );
    }

    if (body.asunto !== undefined || body.categoryId !== undefined) {
      return NextResponse.json(
        { error: "La categoria solo puede cambiarse mediante Corregir caso" },
        { status: 400 }
      );
    }
    const categoryLabel = pqrsCategoryVisibleLabel(pqrs);
    if (categoryLabel === "Sin categoria") {
      return NextResponse.json(
        { error: "Corrige la categoria antes de registrar el primer contacto" },
        { status: 400 }
      );
    }

    const ahora = new Date();
    const diffDays = Math.ceil(
      (ahora.getTime() - pqrs.fechaRecibido.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Generate radicacion number: YYYY-NNNN (sin RAD)
    const yearStr = ahora.getFullYear().toString();
    const numPadded = String(pqrs.numero).padStart(4, "0");
    const numeroRadicacion = `${yearStr}-${numPadded}`;

    const prioridad = typeof body.prioridad === "string" && ["ALTA", "MEDIA", "BAJA"].includes(body.prioridad) ? body.prioridad as "ALTA" | "MEDIA" | "BAJA" : undefined;

    // El historial y la actualizacion del PQRS deben ser atomicos: si el update
    // fallara despues de guardar el historial, quedaria un registro de auditoria
    // describiendo una transicion que nunca se aplico de verdad.
    const updated = await prisma.$transaction(async (tx) => {
      await tx.historialPqrs.create({
        data: {
          tenantId,
          pqrsId: pqrs.id,
          estadoAntes: "EN_ESPERA",
          estadoDespues: "EN_PROGRESO",
          nota: `Primer contacto: ${nota}`,
        },
      });

      return tx.pqrs.update({
        where: { id: params.id, tenantId },
        data: {
          estado: "EN_PROGRESO",
          ...(prioridad ? { prioridad } : {}),
          fechaPrimerContacto: ahora,
          tiempoRespuestaPrimerContacto: diffDays,
          notaPrimerContacto: nota,
          gestionadoPorId: session.user.id,
          numeroRadicacion,
        },
        include: {
          creadoPor: { select: { name: true, email: true } },
          gestionadoPor: { select: { name: true } },
          historial: { orderBy: { creadoAt: "asc" } },
        },
      });
    });

    await registerAuditLog({
      actorUserId: session.user.id,
      tenantId,
      action: AuditAction.PQRS_UPDATED,
      targetType: "Pqrs",
      targetId: updated.id,
      metadata: { numero: updated.numero, estado: updated.estado, evento: "primer_contacto" },
    });

    if (updated.creadoPorId) {
      await createNotification({
        tenantId,
        userId: updated.creadoPorId,
        type: NotificationTypes.PQRS_UPDATED,
        title: "Tu PQRS fue radicada",
        message: `La solicitud #${updated.numero} ya esta en gestion.`,
        resourceType: "Pqrs",
        resourceId: updated.id,
      }).catch(() => null);
    }
    // Send radicacion email to resident
    if (pqrs.creadoPor?.email) {
      try {
        await sendEmail({
          tenantId,
          template: "pqrs_first_contact",
          to: pqrs.creadoPor.email,
          subject: `Su PQRS ha sido radicada - ${numeroRadicacion}`,
          html: renderEmailLayout({
            accent: "success",
            eyebrow: "Primer contacto registrado",
            heading: escapePqrsHtml(pqrs.titulo || "Su solicitud ha sido radicada"),
            bodyHtml: `
              <p>Estimado/a <strong>${escapePqrsHtml(pqrs.creadoPor.name || pqrs.nombreResidente)}</strong>,</p>
              <p>Le informamos que su PQRS ha sido recibida y radicada oficialmente con el siguiente número:</p>
              <div style="background:#ECF6EF;border-radius:12px;padding:16px 18px;text-align:center;margin:16px 0;">
                <p style="margin:0;font-size:11px;font-weight:700;color:#1A6B3A;letter-spacing:0.05em;">NÚMERO DE RADICACIÓN</p>
                <p style="margin:4px 0 0;font-size:24px;font-weight:800;color:#1A6B3A;">${numeroRadicacion}</p>
              </div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;background:#F5F5F7;border-radius:12px;overflow:hidden;">
                <tr><td style="padding:12px 16px;font-size:12px;color:#8E8E93;font-weight:700;width:40%;">ASUNTO</td><td style="padding:12px 16px;font-size:13px;font-weight:700;color:#1D1D1F;">${escapePqrsHtml(categoryLabel)}</td></tr>
              </table>
              <div style="background:#F5F5F7;border-radius:12px;padding:16px 18px;">
                <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#8E8E93;">NOTA DEL PRIMER CONTACTO</p>
                <p style="margin:0;font-size:13.5px;color:#1D1D1F;line-height:1.6;">${escapePqrsHtml(nota)}</p>
              </div>
            `,
            footerNote: "Guarda este número de radicación para hacer seguimiento a tu solicitud.",
          }),
        });
      } catch (emailError) {
        console.error("Error enviando email de radicacion:", emailError);
      }
    }
  if (session.user.role === "ADMIN") await notifyOtherAdministrators({ tenantId, actorUserId: session.user.id, pqrsId: updated.id, numero: updated.numero });
  return NextResponse.json(withoutStorageUrls(updated));
  }

  // --- Actualizar fase ---
  if (body.actualizarFase !== undefined) {
    if (pqrs.estado !== "EN_PROGRESO") {
      return NextResponse.json(
        { error: "Solo se pueden gestionar fases en PQRS en proceso" },
        { status: 400 }
      );
    }

    const { faseActual, faseTipo } = body;
    let fase1Nota: string | undefined;
    let fase2Nota: string | undefined;
    let fase3Nota: string | undefined;
    let fase4Nota: string | undefined;
    try {
      fase1Nota = optionalBoundedText(body.fase1Nota, "Nota de fase 1", 6000);
      fase2Nota = optionalBoundedText(body.fase2Nota, "Nota de fase 2", 6000);
      fase3Nota = optionalBoundedText(body.fase3Nota, "Nota de fase 3", 6000);
      fase4Nota = optionalBoundedText(body.fase4Nota, "Nota de fase 4", 6000);
    } catch (error) {
      const message = error instanceof PqrsValidationError ? error.message : "Nota de fase invalida";
      return NextResponse.json({ error: message }, { status: 400 });
    }
    const requestedFase = Number(faseActual);
    const requestedTipo = faseTipo as "INSUMOS" | "PROVEEDOR" | undefined;

    if (![1, 2, 3, 4, 5].includes(requestedFase)) {
      return NextResponse.json({ error: "Fase invalida" }, { status: 400 });
    }

    const current = pqrs.faseActual || 0;
    const existingTipo = pqrs.faseTipo as "INSUMOS" | "PROVEEDOR" | null;
    // Plantilla con la que esta PQRS nacio (snapshot inmutable, ver
    // Pqrs.workflowType): un cambio posterior en la configuracion del tenant
    // nunca afecta a un caso ya creado.
    const isSimpleWorkflow = pqrs.workflowType === "SIMPLE";

    if (!isSimpleWorkflow && existingTipo && requestedTipo && requestedTipo !== existingTipo) {
      return NextResponse.json({ error: "El tipo de gestion (insumos/proveedor) ya fue definido y no se puede cambiar" }, { status: 400 });
    }

    const notesByFase: Record<number, string | undefined> = { 1: fase1Nota, 2: fase2Nota, 3: fase3Nota, 4: fase4Nota };
    const existingNotesByFase: Record<number, string | null | undefined> = {
      1: pqrs.fase1Nota, 2: pqrs.fase2Nota, 3: pqrs.fase3Nota, 4: pqrs.fase4Nota,
    };
    const finalCurrentNota = (notesByFase[current] ?? existingNotesByFase[current])?.trim?.();

    // MAINTENANCE: 1->2 (INSUMOS) o 1->3 (PROVEEDOR); INSUMOS salta a 2->4;
    // PROVEEDOR va 3->4; ambas convergen en 4->5. SIMPLE: una sola fase
    // generica de gestion (1) que cierra directo en 5, sin insumos/proveedor.
    const validNextFase = VALID_NEXT_FASE_BY_WORKFLOW[pqrs.workflowType];

    if (requestedFase === current) {
      if (current < 1 || current > 4) {
        return NextResponse.json({ error: "Esta fase no admite nota" }, { status: 400 });
      }
    } else if ((validNextFase[current] || []).includes(requestedFase)) {
      if (!isSimpleWorkflow) {
        if (current === 1) {
          if (requestedFase === 2 && requestedTipo !== "INSUMOS") {
            return NextResponse.json({ error: "Para avanzar a fase II debes elegir la ruta de insumos" }, { status: 400 });
          }
          if (requestedFase === 3 && requestedTipo !== "PROVEEDOR") {
            return NextResponse.json({ error: "Para avanzar a fase III debes elegir la ruta de proveedor" }, { status: 400 });
          }
        }
        if (current === 2 && existingTipo !== "INSUMOS") {
          return NextResponse.json({ error: "Esta PQRS no sigue la ruta de insumos" }, { status: 400 });
        }
        if (current === 3 && existingTipo !== "PROVEEDOR") {
          return NextResponse.json({ error: "Esta PQRS no sigue la ruta de proveedor" }, { status: 400 });
        }
      }
      if (current >= 1 && current <= 4 && !finalCurrentNota) {
        return NextResponse.json({ error: `Debes registrar la nota de la fase ${current} antes de avanzar` }, { status: 400 });
      }
    } else {
      return NextResponse.json({ error: "Transicion de fase invalida" }, { status: 400 });
    }

    const ahora = new Date();
    const updateData: Record<string, unknown> = {
      faseActual: requestedFase,
      gestionadoPorId: session.user.id,
    };

    if (requestedTipo) updateData.faseTipo = requestedTipo;

    // Save notes for each phase
    if (fase1Nota !== undefined) updateData.fase1Nota = fase1Nota;
    if (fase2Nota !== undefined) updateData.fase2Nota = fase2Nota;
    if (fase3Nota !== undefined) updateData.fase3Nota = fase3Nota;
    if (fase4Nota !== undefined) updateData.fase4Nota = fase4Nota;

    // Set start date for the phase being activated
    if (requestedFase === 1 && !pqrs.fase1Inicio) updateData.fase1Inicio = ahora;
    if (requestedFase === 2 && !pqrs.fase2Inicio) updateData.fase2Inicio = ahora;
    if (requestedFase === 3 && !pqrs.fase3Inicio) updateData.fase3Inicio = ahora;
    if (requestedFase === 4 && !pqrs.fase4Inicio) updateData.fase4Inicio = ahora;
    if (requestedFase === 5 && !pqrs.fase5Inicio) updateData.fase5Inicio = ahora;

    // Igual que en primer contacto: el historial y el update deben ser atomicos.
    const updated = await prisma.$transaction(async (tx) => {
      if (requestedFase !== current) {
        await tx.historialPqrs.create({
          data: {
            tenantId,
            pqrsId: pqrs.id,
            estadoAntes: pqrs.estado,
            estadoDespues: pqrs.estado,
            nota: `Avanzo de fase ${current || "inicio"} a fase ${requestedFase}${requestedTipo ? ` (${requestedTipo})` : ""}`,
          },
        });
      }

      return tx.pqrs.update({
        where: { id: params.id, tenantId },
        data: updateData,
        include: {
          creadoPor: { select: { name: true, email: true } },
          gestionadoPor: { select: { name: true } },
          historial: { orderBy: { creadoAt: "asc" } },
        },
      });
    });

    await registerAuditLog({
      actorUserId: session.user.id,
      tenantId,
      action: AuditAction.PQRS_UPDATED,
      targetType: "Pqrs",
      targetId: updated.id,
      metadata: { numero: updated.numero, faseActual: requestedFase, faseTipo: requestedTipo ?? null },
    });

    if (updated.creadoPorId) {
      await createNotification({
        tenantId,
        userId: updated.creadoPorId,
        type: NotificationTypes.PQRS_UPDATED,
        title: "Tu PQRS fue actualizada",
        message: `La solicitud #${updated.numero} avanzo en su gestion.`,
        resourceType: "Pqrs",
        resourceId: updated.id,
      }).catch(() => null);
    }
  if (session.user.role === "ADMIN") await notifyOtherAdministrators({ tenantId, actorUserId: session.user.id, pqrsId: updated.id, numero: updated.numero });
  return NextResponse.json(withoutStorageUrls(updated));
  }

  // --- Guardar / Terminar: solo en EN_PROGRESO ---
  if (pqrs.estado === "TERMINADO") {
    return NextResponse.json(
      { error: "Esta PQRS ya esta cerrada" },
      { status: 400 }
    );
  }

  if (pqrs.estado === "EN_ESPERA") {
    return NextResponse.json(
      { error: "Debe registrar el primer contacto antes de gestionar la PQRS" },
      { status: 400 }
    );
  }

  const { evidenciaArchivoData, evidenciaArchivoNombre, terminar } = body;
  let accionTomada: string | undefined;
  let evidenciaCierre: string | undefined;
  let queSeHizoParaCerrar: string | undefined;
  try {
    accionTomada = optionalBoundedText(body.accionTomada, "Accion tomada", 6000);
    evidenciaCierre = optionalBoundedText(body.evidenciaCierre, "Evidencia de cierre", 6000);
    queSeHizoParaCerrar = optionalBoundedText(body.queSeHizoParaCerrar, "Resumen de cierre", 6000);
  } catch (error) {
    const message = error instanceof PqrsValidationError ? error.message : "Datos de cierre invalidos";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // If terminar=true, we're closing the PQRS
  if (terminar) {
    const finalAccion = accionTomada || pqrs.accionTomada;

    if (!finalAccion) {
      return NextResponse.json(
        { error: "Debe indicar la accion tomada" },
        { status: 400 }
      );
    }

    // If phase V not reached, require queSeHizoParaCerrar
    if (pqrs.faseActual !== 5) {
      const finalQueSeHizo = queSeHizoParaCerrar?.trim() || pqrs.queSeHizoParaCerrar?.trim();
      if (!finalQueSeHizo) {
        return NextResponse.json(
          { error: "Si no se completaron todas las fases, debe indicar que se hizo para cerrar la PQRS" },
          { status: 400 }
        );
      }
    }

    // Validate evidencia de cierre is filled
    const finalEvidencia = evidenciaCierre || pqrs.evidenciaCierre;
    if (!finalEvidencia && !evidenciaArchivoData && !pqrs.evidenciaArchivoData && !pqrs.evidenciaArchivoPath) {
      return NextResponse.json(
        { error: "Debe diligenciar la evidencia de cierre antes de terminar" },
        { status: 400 }
      );
    }
  }

  // Build update data
  const ahora = new Date();
  const updateData: Record<string, unknown> = {};

  if (accionTomada !== undefined) updateData.accionTomada = accionTomada;
  if (evidenciaCierre !== undefined) updateData.evidenciaCierre = evidenciaCierre;
  if (queSeHizoParaCerrar !== undefined) updateData.queSeHizoParaCerrar = queSeHizoParaCerrar;

  let uploadedEvidencePath: string | null = null;
  if (evidenciaArchivoData !== undefined) {
    try {
      const validated = validatePqrsFile({
        dataUrl: evidenciaArchivoData,
        fileName: evidenciaArchivoNombre || "evidencia",
        allowedTypes: ALLOWED_EVIDENCE_TYPES,
        maxBytes: 2 * 1024 * 1024,
      });
      const stored = await uploadToStorage({
        tenantId,
        folder: "evidencias",
        fileName: validated.fileName,
        contentType: validated.contentType,
        buffer: validated.buffer,
      });
      uploadedEvidencePath = stored.path;
      updateData.evidenciaArchivoData = null;
      updateData.evidenciaArchivoUrl = null;
      updateData.evidenciaArchivoPath = stored.path;
      updateData.evidenciaArchivoNombre = stored.fileName;
      updateData.evidenciaArchivoTipo = stored.contentType;
      updateData.evidenciaArchivoSize = stored.size;
      updateData.evidenciaArchivoRetiradaAt = null;
      updateData.evidenciaArchivoRetiradaPorId = null;
      updateData.evidenciaArchivoRetiroMotivo = null;
    } catch (error) {
      const message = error instanceof PqrsValidationError ? error.message : "No se pudo subir la evidencia";
      return NextResponse.json({ error: message }, { status: error instanceof PqrsValidationError ? 400 : 500 });
    }
  }

  if (terminar) {
    updateData.estado = "TERMINADO";
    updateData.fechaCierre = ahora;
    const diffDays = Math.ceil(
      (ahora.getTime() - pqrs.fechaRecibido.getTime()) / (1000 * 60 * 60 * 24)
    );
    updateData.tiempoRespuestaCierre = diffDays;
  }

  updateData.gestionadoPorId = session.user.id;

  // Igual que en primer contacto/fase: el historial (si aplica) y el update
  // deben ser atomicos.
  let updated;
  try {
    updated = await prisma.$transaction(async (tx) => {
    if (terminar) {
      await tx.historialPqrs.create({
        data: {
          tenantId,
          pqrsId: pqrs.id,
          estadoAntes: pqrs.estado,
          estadoDespues: "TERMINADO",
          nota: "PQRS cerrada",
        },
      });
    }

    return tx.pqrs.update({
      where: { id: params.id, tenantId },
      data: updateData,
      include: {
        creadoPor: { select: { name: true, email: true } },
        gestionadoPor: { select: { name: true } },
        historial: { orderBy: { creadoAt: "asc" } },
      },
    });
  });
  } catch {
    if (uploadedEvidencePath) {
      await deleteFromStorage(uploadedEvidencePath, {
        tenantId,
        folders: ["evidencias"],
      }).catch(() => null);
    }
    console.error("[pqrs/update] No se pudo persistir la actualizacion");
    return NextResponse.json({ error: "No se pudo actualizar la PQRS" }, { status: 500 });
  }
  if (
    uploadedEvidencePath &&
    pqrs.evidenciaArchivoPath &&
    pqrs.evidenciaArchivoPath !== uploadedEvidencePath
  ) {
    await deleteFromStorage(pqrs.evidenciaArchivoPath, {
      tenantId,
      folders: ["evidencias"],
    }).catch(() => console.error("[pqrs/update] No se pudo limpiar la evidencia anterior"));
  }

  await registerAuditLog({
    actorUserId: session.user.id,
    tenantId,
    action: terminar ? AuditAction.PQRS_CLOSED : AuditAction.PQRS_UPDATED,
    targetType: "Pqrs",
    targetId: updated.id,
    metadata: { numero: updated.numero, estado: updated.estado, terminar: Boolean(terminar) },
  });

  if (updated.creadoPorId) {
    await createNotification({
      tenantId,
      userId: updated.creadoPorId,
      type: terminar ? NotificationTypes.PQRS_CLOSED : NotificationTypes.PQRS_UPDATED,
      title: terminar ? "Tu PQRS fue cerrada" : "Tu PQRS fue actualizada",
      message: terminar ? `La solicitud #${updated.numero} fue cerrada.` : `La solicitud #${updated.numero} tiene una nueva actualizacion.`,
      resourceType: "Pqrs",
      resourceId: updated.id,
    }).catch(() => null);
  }

  // Send email only when closing
  if (terminar && updated.creadoPor?.email) {
    const fechaRecibido = pqrs.fechaRecibido.toLocaleDateString("es-CO", {
      day: "2-digit", month: "2-digit", year: "numeric",
    });
    const fechaCierre = ahora.toLocaleDateString("es-CO", {
      day: "2-digit", month: "2-digit", year: "numeric",
    });

    try {
      // Build attachments if there's an evidence file
      const attachments: { filename: string; content: Buffer; contentType?: string }[] = [];
      if (updated.evidenciaArchivoPath && updated.evidenciaArchivoNombre) {
        attachments.push({
          filename: updated.evidenciaArchivoNombre,
          content: await downloadFromStorage(updated.evidenciaArchivoPath, { tenantId, folders: ["evidencias"] }),
          contentType: updated.evidenciaArchivoTipo || undefined,
        });
      } else if (updated.evidenciaArchivoData && updated.evidenciaArchivoNombre) {
        const base64Data = (updated.evidenciaArchivoData as string).replace(/^data:[^;]+;base64,/, "");
        attachments.push({
          filename: updated.evidenciaArchivoNombre,
          content: Buffer.from(base64Data, "base64"),
          contentType: updated.evidenciaArchivoTipo || undefined,
        });
      }

      await sendEmail({
        tenantId,
        template: "pqrs_closed",
        to: updated.creadoPor.email,
        subject: `PQRS #${pqrs.numero} cerrada`,
        html: renderEmailLayout({
          accent: "success",
          eyebrow: "Solicitud resuelta",
          heading: escapePqrsHtml(pqrs.titulo || "Su PQRS ha sido resuelta"),
          bodyHtml: `
            <p>Estimado/a <strong>${escapePqrsHtml(updated.creadoPor.name || pqrs.nombreResidente)}</strong>,</p>
            <p>Le informamos que su solicitud ha sido cerrada.</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;background:#F5F5F7;border-radius:12px;overflow:hidden;">
              <tr><td style="padding:12px 16px;font-size:12px;color:#8E8E93;font-weight:700;width:44%;">N.° RADICACIÓN</td><td style="padding:12px 16px;font-size:13px;font-weight:700;color:#1D1D1F;">${pqrs.numeroRadicacion || "N/A"}</td></tr>
              <tr><td style="padding:12px 16px;font-size:12px;color:#8E8E93;font-weight:700;border-top:1px solid #E5E5EA;">ASUNTO</td><td style="padding:12px 16px;font-size:13px;font-weight:700;color:#1D1D1F;border-top:1px solid #E5E5EA;">${escapePqrsHtml(pqrsCategoryVisibleLabel(pqrs))}</td></tr>
              <tr><td style="padding:12px 16px;font-size:12px;color:#8E8E93;font-weight:700;border-top:1px solid #E5E5EA;">FECHA RECIBIDO</td><td style="padding:12px 16px;font-size:13px;font-weight:700;color:#1D1D1F;border-top:1px solid #E5E5EA;">${fechaRecibido}</td></tr>
              <tr><td style="padding:12px 16px;font-size:12px;color:#8E8E93;font-weight:700;border-top:1px solid #E5E5EA;">FECHA CIERRE</td><td style="padding:12px 16px;font-size:13px;font-weight:700;color:#1D1D1F;border-top:1px solid #E5E5EA;">${fechaCierre}</td></tr>
              <tr><td style="padding:12px 16px;font-size:12px;color:#8E8E93;font-weight:700;border-top:1px solid #E5E5EA;">ESTADO</td><td style="padding:12px 16px;font-size:13px;font-weight:700;color:#1A6B3A;border-top:1px solid #E5E5EA;">${ESTADO_LABEL["TERMINADO"]}</td></tr>
              <tr><td style="padding:12px 16px;font-size:12px;color:#8E8E93;font-weight:700;border-top:1px solid #E5E5EA;">ACCIÓN TOMADA</td><td style="padding:12px 16px;font-size:13px;font-weight:700;color:#1D1D1F;border-top:1px solid #E5E5EA;">${escapePqrsHtml(updated.accionTomada || pqrs.accionTomada || "N/A")}</td></tr>
              ${updated.evidenciaCierre ? `<tr><td style="padding:12px 16px;font-size:12px;color:#8E8E93;font-weight:700;border-top:1px solid #E5E5EA;">EVIDENCIA DE CIERRE</td><td style="padding:12px 16px;font-size:13px;font-weight:700;color:#1D1D1F;border-top:1px solid #E5E5EA;">${escapePqrsHtml(updated.evidenciaCierre)}</td></tr>` : ""}
            </table>
            <div style="background:#F5F5F7;border-radius:12px;padding:16px 18px;">
              <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#8E8E93;">DESCRIPCIÓN ORIGINAL</p>
              <p style="margin:0;font-size:13.5px;color:#1D1D1F;line-height:1.6;">${escapePqrsHtml(pqrs.descripcion)}</p>
            </div>
            ${attachments.length > 0 ? `<p style="margin:16px 0 0;font-size:13px;color:#6E6E73;">Se adjunta el archivo de evidencia de cierre.</p>` : ""}
          `,
        }),
        attachments,
      });
    } catch (emailError) {
      console.error("Error enviando email de cierre:", emailError);
    }
  }
  if (session.user.role === "ADMIN") await notifyOtherAdministrators({ tenantId, actorUserId: session.user.id, pqrsId: updated.id, numero: updated.numero });
  return NextResponse.json(withoutStorageUrls(updated));
}

type PqrsRouteContext = { params: { id: string } };

export async function GET(req: NextRequest, context: PqrsRouteContext) {
  try {
    return await handleGet(req, context);
  } catch {
    console.error("[pqrs/detail] Error inesperado");
    return NextResponse.json({ error: "No se pudo obtener la PQRS" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, context: PqrsRouteContext) {
  try {
    return await handlePatch(req, context);
  } catch {
    console.error("[pqrs/update] Error inesperado");
    return NextResponse.json({ error: "No se pudo actualizar la PQRS" }, { status: 500 });
  }
}



