import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";

const ESTADO_LABEL: Record<string, string> = {
  EN_ESPERA: "En espera",
  EN_PROGRESO: "En proceso",
  TERMINADO: "Terminado",
};

const ASUNTOS_VALIDOS = [
  "AREA COMUN",
  "AREA PRIVADA",
  "CONTABILIDAD",
  "CONVIVENCIA",
  "HUMEDAD/CUBIERTA",
  "HUMEDAD/DEPOSITO",
  "HUMEDAD/VENTANAS",
  "HUMEDAD/FACHADA",
  "HUMEDAD/GARAJE",
];

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
      fotos: {
        select: { id: true, nombre: true, tipo: true, orden: true },
        orderBy: { orden: "asc" },
      },
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

  // --- Primer contacto: EN_ESPERA → EN_PROGRESO ---
  if (body.primerContacto) {
    if (pqrs.estado !== "EN_ESPERA") {
      return NextResponse.json(
        { error: "El primer contacto ya fue registrado" },
        { status: 400 }
      );
    }

    const nota = (body.notaPrimerContacto || "").trim();
    if (!nota) {
      return NextResponse.json(
        { error: "Debe escribir una nota de primer contacto" },
        { status: 400 }
      );
    }

    // Asunto es obligatorio para registrar primer contacto
    const asunto = body.asunto || pqrs.asunto;
    if (!asunto) {
      return NextResponse.json(
        { error: "Debe seleccionar un asunto antes de registrar el primer contacto" },
        { status: 400 }
      );
    }

    if (!ASUNTOS_VALIDOS.includes(asunto)) {
      return NextResponse.json(
        { error: "Asunto inválido" },
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

    await prisma.historialPqrs.create({
      data: {
        pqrsId: pqrs.id,
        estadoAntes: "EN_ESPERA",
        estadoDespues: "EN_PROGRESO",
        nota: `Primer contacto: ${nota}`,
      },
    });

    const updated = await prisma.pqrs.update({
      where: { id: params.id },
      data: {
        estado: "EN_PROGRESO",
        asunto,
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

    // Send radicacion email to resident
    if (pqrs.creadoPor?.email) {
      try {
        await sendEmail({
          to: pqrs.creadoPor.email,
          subject: `Su PQRS ha sido radicada - ${numeroRadicacion}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #15803d;">Su solicitud ha sido radicada</h2>
              <p>Estimado/a <strong>${pqrs.creadoPor.name || pqrs.nombreResidente}</strong>,</p>
              <p>Le informamos que su PQRS ha sido recibida y está siendo gestionada.</p>
              <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 16px 0;">
                <p style="margin: 0; font-size: 14px; color: #166534;">N° de radicación</p>
                <p style="margin: 4px 0 0; font-size: 24px; font-weight: bold; color: #15803d;">${numeroRadicacion}</p>
              </div>
              <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Asunto</td><td style="padding: 8px; border: 1px solid #ddd;">${asunto}</td></tr>
                <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Ubicación</td><td style="padding: 8px; border: 1px solid #ddd;">Bloque ${pqrs.bloque} - Apto ${pqrs.apto}</td></tr>
              </table>
              <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 16px 0;">
                <p style="margin: 0; font-size: 14px; font-weight: bold; color: #374151;">Nota del primer contacto:</p>
                <p style="margin: 8px 0 0; font-size: 14px; color: #4b5563;">${nota}</p>
              </div>
              <p style="color: #666; font-size: 14px;">Guarde este numero para hacer seguimiento a su solicitud.</p>
              <p style="color: #666; font-size: 14px;">Conjunto Parque Residencial Calle 100</p>
            </div>
          `,
        });
      } catch (emailError) {
        console.error("Error enviando email de radicacion:", emailError);
      }
    }

    return NextResponse.json(updated);
  }

  // --- Actualizar fase ---
  if (body.actualizarFase !== undefined) {
    if (pqrs.estado !== "EN_PROGRESO") {
      return NextResponse.json(
        { error: "Solo se pueden gestionar fases en PQRS en proceso" },
        { status: 400 }
      );
    }

    const { faseActual, faseTipo, fase1Nota, fase2Nota, fase3Nota, fase4Nota } = body;
    const ahora = new Date();
    const updateData: Record<string, unknown> = {
      faseActual,
      gestionadoPorId: session.user.id,
    };

    if (faseTipo) updateData.faseTipo = faseTipo;

    // Save notes for each phase
    if (fase1Nota !== undefined) updateData.fase1Nota = fase1Nota;
    if (fase2Nota !== undefined) updateData.fase2Nota = fase2Nota;
    if (fase3Nota !== undefined) updateData.fase3Nota = fase3Nota;
    if (fase4Nota !== undefined) updateData.fase4Nota = fase4Nota;

    // Set start date for the phase being activated
    if (faseActual === 1 && !pqrs.fase1Inicio) updateData.fase1Inicio = ahora;
    if (faseActual === 2 && !pqrs.fase2Inicio) updateData.fase2Inicio = ahora;
    if (faseActual === 3 && !pqrs.fase3Inicio) updateData.fase3Inicio = ahora;
    if (faseActual === 4 && !pqrs.fase4Inicio) updateData.fase4Inicio = ahora;
    if (faseActual === 5 && !pqrs.fase5Inicio) updateData.fase5Inicio = ahora;

    const updated = await prisma.pqrs.update({
      where: { id: params.id },
      data: updateData,
      include: {
        creadoPor: { select: { name: true, email: true } },
        gestionadoPor: { select: { name: true } },
        historial: { orderBy: { creadoAt: "asc" } },
      },
    });

    return NextResponse.json(updated);
  }

  // --- Guardar / Terminar: solo en EN_PROGRESO ---
  if (pqrs.estado === "TERMINADO") {
    return NextResponse.json(
      { error: "Esta PQRS ya está cerrada" },
      { status: 400 }
    );
  }

  if (pqrs.estado === "EN_ESPERA") {
    return NextResponse.json(
      { error: "Debe registrar el primer contacto antes de gestionar la PQRS" },
      { status: 400 }
    );
  }

  const { accionTomada, evidenciaCierre, evidenciaArchivoData, evidenciaArchivoNombre, evidenciaArchivoTipo, terminar, queSeHizoParaCerrar } = body;

  // If terminar=true, we're closing the PQRS
  if (terminar) {
    const finalAccion = accionTomada || pqrs.accionTomada;

    if (!finalAccion) {
      return NextResponse.json(
        { error: "Para cerrar la PQRS debe completar la acción tomada" },
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
    if (!finalEvidencia && !evidenciaArchivoData && !pqrs.evidenciaArchivoData) {
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
  if (evidenciaArchivoData !== undefined) updateData.evidenciaArchivoData = evidenciaArchivoData;
  if (evidenciaArchivoNombre !== undefined) updateData.evidenciaArchivoNombre = evidenciaArchivoNombre;
  if (evidenciaArchivoTipo !== undefined) updateData.evidenciaArchivoTipo = evidenciaArchivoTipo;

  if (terminar) {
    updateData.estado = "TERMINADO";
    updateData.fechaCierre = ahora;
    const diffDays = Math.ceil(
      (ahora.getTime() - pqrs.fechaRecibido.getTime()) / (1000 * 60 * 60 * 24)
    );
    updateData.tiempoRespuestaCierre = diffDays;

    // Register in historial
    await prisma.historialPqrs.create({
      data: {
        pqrsId: pqrs.id,
        estadoAntes: pqrs.estado,
        estadoDespues: "TERMINADO",
        nota: "PQRS cerrada",
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
      if (updated.evidenciaArchivoData && updated.evidenciaArchivoNombre) {
        const base64Data = (updated.evidenciaArchivoData as string).replace(/^data:[^;]+;base64,/, "");
        attachments.push({
          filename: updated.evidenciaArchivoNombre,
          content: Buffer.from(base64Data, "base64"),
          contentType: updated.evidenciaArchivoTipo || undefined,
        });
      }

      await sendEmail({
        to: updated.creadoPor.email,
        subject: `PQRS #${pqrs.numero} cerrada`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1a1a1a;">Su PQRS ha sido resuelta</h2>
            <p>Estimado/a <strong>${updated.creadoPor.name || pqrs.nombreResidente}</strong>,</p>
            <p>Le informamos que su solicitud ha sido cerrada.</p>
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">N° Solicitud</td><td style="padding: 8px; border: 1px solid #ddd;">#${pqrs.numero}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Asunto</td><td style="padding: 8px; border: 1px solid #ddd;">${pqrs.asunto || "N/A"}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Descripcion</td><td style="padding: 8px; border: 1px solid #ddd;">${pqrs.descripcion}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Fecha recibido</td><td style="padding: 8px; border: 1px solid #ddd;">${fechaRecibido}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Fecha cierre</td><td style="padding: 8px; border: 1px solid #ddd;">${fechaCierre}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Estado</td><td style="padding: 8px; border: 1px solid #ddd;">${ESTADO_LABEL["TERMINADO"]}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Acción tomada</td><td style="padding: 8px; border: 1px solid #ddd;">${updated.accionTomada}</td></tr>
              ${updated.evidenciaCierre ? `<tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Evidencia de cierre</td><td style="padding: 8px; border: 1px solid #ddd;">${updated.evidenciaCierre}</td></tr>` : ""}
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Ubicación</td><td style="padding: 8px; border: 1px solid #ddd;">Bloque ${pqrs.bloque} - Apto ${pqrs.apto}</td></tr>
            </table>
            ${attachments.length > 0 ? `<p style="color: #666; font-size: 14px;">Se adjunta archivo de evidencia de cierre.</p>` : ""}
            <p style="color: #666; font-size: 14px;">Conjunto Parque Residencial Calle 100</p>
          </div>
        `,
        attachments,
      });
    } catch (emailError) {
      console.error("Error enviando email de cierre:", emailError);
    }
  }

  return NextResponse.json(updated);
}
