import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTenantIdFromSession } from "@/domains/organizations/tenant.service";
import { getTenantAccessResponse } from "@/lib/tenant-access-response";
import { dataUrlToBuffer, uploadToStorage } from "@/lib/storage";
import { sendEmail, sendEmailSafe } from "@/lib/email";
import { AuditAction, Prisma } from "@prisma/client";
import { registerAuditLog } from "@/domains/platform/audit.service";
import { createNotification, NotificationTypes } from "@/domains/notifications/notification.service";
import { pqrsScopeForUser } from "@/domains/pqrs/pqrs-permissions";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (session.user.role === "SUPER_ADMIN") {
    return NextResponse.json({ error: "No tiene permisos" }, { status: 403 });
  }

  const tenantAccessResponse = await getTenantAccessResponse(session);
  if (tenantAccessResponse) return tenantAccessResponse;

  const tenantId = getTenantIdFromSession(session);
  const { searchParams } = req.nextUrl;
  const estado = searchParams.get("estado");
  const asunto = searchParams.get("asunto");
  const year = searchParams.get("year");
  const mes = searchParams.get("mes");
  const scope = searchParams.get("scope"); // "active" | "historial" | null
  const searchBloque = searchParams.get("bloque");
  const searchApto = searchParams.get("apto");
  const searchNumero = searchParams.get("numero");

  // Construir filtros
  const where: Prisma.PqrsWhereInput = pqrsScopeForUser({ tenantId, userId: session.user.id, role: session.user.role });

  // Scope: active = EN_ESPERA + EN_PROGRESO, historial = TERMINADO
  if (scope === "active") {
    where.estado = { in: ["EN_ESPERA", "EN_PROGRESO"] };
  } else if (scope === "historial") {
    where.estado = "TERMINADO";
  }

  if (estado) {
    where.estado = estado as Prisma.EnumEstadoFilter["equals"];
  }

  if (asunto) {
    where.asunto = asunto;
  }

  if (mes) {
    where.mes = mes;
  }

  if (year) {
    const yearNum = parseInt(year);
    where.fechaRecibido = {
      gte: new Date(`${yearNum}-01-01`),
      lt: new Date(`${yearNum + 1}-01-01`),
    };
  }

  if (searchBloque) {
    where.bloque = parseInt(searchBloque);
  }

  if (searchApto) {
    where.apto = parseInt(searchApto);
  }

  if (searchNumero) {
    where.numero = parseInt(searchNumero);
  }

  const pqrs = await prisma.pqrs.findMany({
    where,
    orderBy: { fechaRecibido: "desc" },
    include: {
      creadoPor: {
        select: { name: true },
      },
      gestionadoPor: {
        select: { name: true },
      },
    },
  });

  return NextResponse.json(pqrs);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // Solo ADMIN y RESIDENTE pueden crear
  if (session.user.role !== "ADMIN" && session.user.role !== "RESIDENTE") {
    return NextResponse.json({ error: "No tiene permisos" }, { status: 403 });
  }

  const tenantAccessResponse = await getTenantAccessResponse(session);
  if (tenantAccessResponse) return tenantAccessResponse;

  const tenantId = getTenantIdFromSession(session);

  const body = await req.json();
  const { titulo, asunto, descripcion, nombreResidente, bloque, apto, fotos } = body;

  // Validaciones - solo descripcion es obligatoria
  if (!descripcion) {
    return NextResponse.json(
      { error: "La descripcion es obligatoria" },
      { status: 400 }
    );
  }

  const wordCount = descripcion.trim() === "" ? 0 : descripcion.trim().split(/\s+/).length;
  if (wordCount > 300) {
    return NextResponse.json(
      { error: "La descripcion no puede superar 300 palabras" },
      { status: 400 }
    );
  }

  const isAdmin = session.user.role === "ADMIN";

  // ADMIN crea a nombre de un residente (manual)
  // RESIDENTE usa sus datos de sesion
  const finalNombre = isAdmin ? nombreResidente : session.user.name;
  const finalBloque = isAdmin ? parseInt(bloque) : session.user.bloque;
  const finalApto = isAdmin ? parseInt(apto) : session.user.apto;

  if (!finalNombre || !finalBloque || !finalApto) {
    return NextResponse.json(
      { error: "Nombre, bloque y apartamento son obligatorios" },
      { status: 400 }
    );
  }

  if (finalBloque < 1 || finalBloque > 999) {
    return NextResponse.json({ error: "Bloque invalido" }, { status: 400 });
  }

  // Validar fotos opcionales
  const fotosArray: { data: string; nombre: string; tipo: string; orden: number }[] = [];
  if (fotos && Array.isArray(fotos)) {
    if (fotos.length > 3) {
      return NextResponse.json({ error: "MÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ximo 3 fotos permitidas" }, { status: 400 });
    }
    for (let i = 0; i < fotos.length; i++) {
      const foto = fotos[i];
      if (!foto.data || !foto.nombre || !foto.tipo) {
        return NextResponse.json({ error: "Datos de foto incompletos" }, { status: 400 });
      }
      if (!ALLOWED_IMAGE_TYPES.has(foto.tipo)) {
        return NextResponse.json({ error: "Solo se permiten imagenes JPG, PNG o WEBP" }, { status: 400 });
      }
      if (foto.nombre.length > 180 || /[\/]/.test(foto.nombre)) {
        return NextResponse.json({ error: "Nombre de archivo invalido" }, { status: 400 });
      }
      if (!foto.data.startsWith("data:" + foto.tipo + ";base64,")) {
        return NextResponse.json({ error: "El contenido no coincide con el tipo de archivo" }, { status: 400 });
      }
      const base64Data = foto.data.replace(/^data:[^;]+;base64,/, "");
      const sizeBytes = Math.ceil(base64Data.length * 0.75);
      if (sizeBytes > 1024 * 1024) {
        return NextResponse.json({ error: `La foto "${foto.nombre}" supera 1MB` }, { status: 400 });
      }
      fotosArray.push({ data: foto.data, nombre: foto.nombre, tipo: foto.tipo, orden: i });
    }
  }

  const ahora = new Date();

  let storedFotos: {
    url: string;
    storagePath: string;
    nombre: string;
    tipo: string;
    size: number;
    orden: number;
  }[] = [];

  try {
    storedFotos = await Promise.all(
      fotosArray.map(async (foto) => {
        const { contentType, buffer } = dataUrlToBuffer(foto.data);
        const stored = await uploadToStorage({
          tenantId,
          folder: "fotos",
          fileName: foto.nombre,
          contentType: foto.tipo || contentType,
          buffer,
        });

        return {
          url: stored.url,
          storagePath: stored.path,
          nombre: stored.fileName,
          tipo: stored.contentType,
          size: stored.size,
          orden: foto.orden,
        };
      })
    );
  } catch (error) {
    console.error("Error subiendo fotos de PQRS:", error);
    return NextResponse.json(
      { error: "No se pudieron subir las fotos" },
      { status: 500 }
    );
  }

  const pqrs = await prisma.$transaction(async (tx) => {
    const nuevoPqrs = await tx.pqrs.create({
      data: {
        tenantId,
        medio: "PLATAFORMA_WEB",
        fechaRecibido: ahora,
        mes: MESES[ahora.getMonth()],
        bloque: finalBloque,
        apto: finalApto,
        nombreResidente: finalNombre,
        titulo: titulo ? String(titulo).trim().slice(0, 120) : null,
        asunto: isAdmin ? (asunto || null) : null,
        descripcion,
        creadoPorId: session.user.id,
      },
    });

    if (storedFotos.length > 0) {
      await tx.pqrsFoto.createMany({
        data: storedFotos.map((f) => ({
          tenantId,
          pqrsId: nuevoPqrs.id,
          data: null,
          url: f.url,
          storagePath: f.storagePath,
          nombre: f.nombre,
          tipo: f.tipo,
          size: f.size,
          orden: f.orden,
        })),
      });
    }

    await tx.historialPqrs.create({
      data: {
        tenantId,
        pqrsId: nuevoPqrs.id,
        estadoDespues: "EN_ESPERA",
        nota: `PQRS creada por ${isAdmin ? "administracion" : "residente"}`,
      },
    });

    return nuevoPqrs;
  });

  await registerAuditLog({
    actorUserId: session.user.id,
    tenantId,
    action: AuditAction.PQRS_CREATED,
    targetType: "Pqrs",
    targetId: pqrs.id,
    metadata: { numero: pqrs.numero, asunto: pqrs.asunto, estado: pqrs.estado },
  });

  const recipients = await prisma.user.findMany({
    where: { tenantId, role: "ADMIN" },
    select: { id: true, role: true, email: true, notifyNewPqrsEmail: true },
  });

  await Promise.allSettled(
    recipients.map((recipient) =>
      createNotification({
        tenantId,
        userId: recipient.id,
        type: NotificationTypes.PQRS_CREATED,
        title: "Nueva PQRS recibida",
        message: `Se creo la PQRS #${pqrs.numero}.`,
        resourceType: "Pqrs",
        resourceId: pqrs.id,
      })
    )
  );

  await Promise.allSettled(
    recipients
      .filter((recipient) => recipient.role === "ADMIN" && recipient.notifyNewPqrsEmail && recipient.email)
      .map((recipient) =>
        sendEmailSafe({
          tenantId,
          template: "pqrs_created_admin_alert",
          to: recipient.email,
          subject: `Nueva PQRS #${pqrs.numero} radicada`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #122545;">Nueva PQRS radicada</h2>
              <p>Se registro la solicitud <strong>#${pqrs.numero}</strong>${pqrs.asunto ? ` — ${pqrs.asunto}` : ""}.</p>
              <p>Ingresa al panel de administracion para revisarla y dar el primer contacto.</p>
              <p style="color: #666; font-size: 13px; margin-top: 20px;">Puedes desactivar este correo en Configuracion &gt; Notificaciones.</p>
            </div>
          `,
        })
      )
  );

  if (!isAdmin && session.user.email) {
    try {
      await sendEmail({
        tenantId,
        template: "pqrs_received",
        to: session.user.email,
        subject: `Recibimos tu solicitud #${pqrs.numero}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #122545;">Recibimos tu solicitud</h2>
            <p>Hola <strong>${finalNombre}</strong>,</p>
            <p>Ya recibimos tu PQRS y en breve la administracion se pondra en contacto contigo. Te avisaremos por correo tan pronto quede radicada oficialmente.</p>
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Numero interno</td><td style="padding: 8px; border: 1px solid #ddd;">#${pqrs.numero}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Ubicacion</td><td style="padding: 8px; border: 1px solid #ddd;">Bloque ${finalBloque}, apto ${finalApto}</td></tr>
            </table>
            <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 16px 0;">
              <p style="margin: 0; font-size: 14px; color: #374151;">${descripcion}</p>
            </div>
            <p style="color: #666; font-size: 14px;">PQRS Services</p>
          </div>
        `,
      });
    } catch (emailError) {
      console.error("Error enviando email de recepcion:", emailError);
    }
  }

  return NextResponse.json(pqrs, { status: 201 });
}


