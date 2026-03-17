import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Estado } from "@prisma/client";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const ESTADO_LABEL: Record<string, string> = {
  EN_ESPERA: "En espera",
  EN_PROGRESO: "En progreso",
  TERMINADO: "Terminado",
};

const TIPO_LABEL: Record<string, string> = {
  PETICION: "Petición",
  QUEJA: "Queja",
  RECLAMO: "Reclamo",
  SUGERENCIA: "Sugerencia",
};

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const pqrs = await prisma.pqrs.findUnique({
    where: { id: params.id },
    include: {
      creadoPor: { select: { name: true, email: true } },
      gestionadoPor: { select: { name: true } },
      historial: { orderBy: { creadoAt: "asc" } },
    },
  });

  if (!pqrs) {
    return NextResponse.json({ error: "PQRS no encontrada" }, { status: 404 });
  }

  // RESIDENTE solo puede ver sus propias PQRS
  if (session.user.role === "RESIDENTE" && pqrs.creadoPorId !== session.user.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  return NextResponse.json(pqrs);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // Solo ADMIN puede editar
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "No tiene permisos" }, { status: 403 });
  }

  const pqrs = await prisma.pqrs.findUnique({
    where: { id: params.id },
    include: { creadoPor: { select: { email: true, name: true } } },
  });

  if (!pqrs) {
    return NextResponse.json({ error: "PQRS no encontrada" }, { status: 404 });
  }

  const body = await req.json();
  const { estado, accionTomada, evidenciaCierre } = body;

  // Validar transición de estado
  if (estado && !Object.values(Estado).includes(estado)) {
    return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
  }

  // Si se cierra (TERMINADO), accionTomada y evidenciaCierre son obligatorios
  if (estado === "TERMINADO") {
    const finalAccion = accionTomada || pqrs.accionTomada;
    const finalEvidencia = evidenciaCierre || pqrs.evidenciaCierre;

    if (!finalAccion || !finalEvidencia) {
      return NextResponse.json(
        { error: "Para cerrar la PQRS debe completar la acción tomada y la evidencia de cierre" },
        { status: 400 }
      );
    }
  }

  // Construir datos de actualización
  const ahora = new Date();
  const updateData: Record<string, unknown> = {};

  if (accionTomada !== undefined) updateData.accionTomada = accionTomada;
  if (evidenciaCierre !== undefined) updateData.evidenciaCierre = evidenciaCierre;

  if (estado && estado !== pqrs.estado) {
    updateData.estado = estado;

    // Primer contacto: cuando pasa de EN_ESPERA a EN_PROGRESO
    if (pqrs.estado === "EN_ESPERA" && estado === "EN_PROGRESO") {
      updateData.fechaPrimerContacto = ahora;
      // Calcular días hábiles de respuesta
      const diffDays = Math.ceil(
        (ahora.getTime() - pqrs.fechaRecibido.getTime()) / (1000 * 60 * 60 * 24)
      );
      updateData.tiempoRespuestaPrimerContacto = diffDays;
    }

    // Cierre
    if (estado === "TERMINADO") {
      updateData.fechaCierre = ahora;
      const diffDays = Math.ceil(
        (ahora.getTime() - pqrs.fechaRecibido.getTime()) / (1000 * 60 * 60 * 24)
      );
      updateData.tiempoRespuestaCierre = diffDays;
    }

    // Registrar en historial
    await prisma.historialPqrs.create({
      data: {
        pqrsId: pqrs.id,
        estadoAntes: pqrs.estado,
        estadoDespues: estado,
        nota:
          estado === "EN_PROGRESO"
            ? "PQRS en gestión"
            : estado === "TERMINADO"
            ? "PQRS cerrada"
            : "Cambio de estado",
      },
    });
  }

  updateData.gestionadoPorId = session.user.id;

  const updated = await prisma.pqrs.update({
    where: { id: params.id },
    data: updateData,
    include: {
      creadoPor: { select: { name: true, email: true } },
      gestionadoPor: { select: { name: true } },
      historial: { orderBy: { creadoAt: "asc" } },
    },
  });

  // Enviar email al residente cuando se cierra
  if (estado === "TERMINADO" && updated.creadoPor?.email) {
    const fechaRecibido = pqrs.fechaRecibido.toLocaleDateString("es-CO", {
      day: "2-digit", month: "2-digit", year: "numeric",
    });
    const fechaCierre = ahora.toLocaleDateString("es-CO", {
      day: "2-digit", month: "2-digit", year: "numeric",
    });

    try {
      await resend.emails.send({
        from: process.env.EMAIL_FROM || "onboarding@resend.dev",
        to: updated.creadoPor.email,
        subject: `PQRS #${pqrs.numero} - ${TIPO_LABEL[pqrs.tipoPqrs]} cerrada`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1a1a1a;">Su ${TIPO_LABEL[pqrs.tipoPqrs]} ha sido resuelta</h2>
            <p>Estimado/a <strong>${updated.creadoPor.name || pqrs.nombreResidente}</strong>,</p>
            <p>Le informamos que su solicitud ha sido cerrada.</p>
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">N° Solicitud</td><td style="padding: 8px; border: 1px solid #ddd;">#${pqrs.numero}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Tipo</td><td style="padding: 8px; border: 1px solid #ddd;">${TIPO_LABEL[pqrs.tipoPqrs]}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Asunto</td><td style="padding: 8px; border: 1px solid #ddd;">${pqrs.asunto}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Descripción</td><td style="padding: 8px; border: 1px solid #ddd;">${pqrs.descripcion}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Fecha recibido</td><td style="padding: 8px; border: 1px solid #ddd;">${fechaRecibido}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Fecha cierre</td><td style="padding: 8px; border: 1px solid #ddd;">${fechaCierre}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Estado</td><td style="padding: 8px; border: 1px solid #ddd;">${ESTADO_LABEL[estado]}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Acción tomada</td><td style="padding: 8px; border: 1px solid #ddd;">${updated.accionTomada}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Evidencia de cierre</td><td style="padding: 8px; border: 1px solid #ddd;">${updated.evidenciaCierre}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Ubicación</td><td style="padding: 8px; border: 1px solid #ddd;">Torre ${pqrs.bloque} - Apto ${pqrs.apto}</td></tr>
            </table>
            <p style="color: #666; font-size: 14px;">Conjunto Parque Residencial Calle 100 P.H.</p>
          </div>
        `,
      });
    } catch (emailError) {
      console.error("Error enviando email de cierre:", emailError);
    }
  }

  return NextResponse.json(updated);
}
