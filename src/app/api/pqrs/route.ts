import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTenantIdFromSession } from "@/domains/organizations/tenant.service";
import { getTenantAccessResponse } from "@/lib/tenant-access-response";
import { deleteFromStorage, uploadToStorage } from "@/lib/storage";
import { sendEmail, sendEmailSafe, renderEmailLayout } from "@/lib/email";
import { AuditAction, Prisma } from "@prisma/client";
import { registerAuditLog } from "@/domains/platform/audit.service";
import { createNotification, NotificationTypes } from "@/domains/notifications/notification.service";
import { pqrsScopeForUser } from "@/domains/pqrs/pqrs-permissions";
import { toResidentPqrsView, withoutStorageUrls } from "@/domains/pqrs/resident-view";
import {
  escapePqrsHtml,
  isRecord,
  optionalBoundedText,
  PqrsValidationError,
  validatePqrsFile,
} from "@/domains/pqrs/pqrs-security";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const ESTADOS_VALIDOS = new Set(["EN_ESPERA", "EN_PROGRESO", "TERMINADO"]);
const ASUNTOS_VALIDOS = new Set(["AREA COMUN", "AREA PRIVADA", "CONTABILIDAD", "CONVIVENCIA", "HUMEDAD/CUBIERTA", "HUMEDAD/DEPOSITO", "HUMEDAD/VENTANAS", "HUMEDAD/FACHADA", "HUMEDAD/GARAJE"]);

async function handleGet(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (session.user.role === "SUPER_ADMIN" || !session.user.role) {
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
  const freeText = searchParams.get("search")?.trim() || "";
  const pageParam = searchParams.get("page");
  const pageSizeParam = searchParams.get("pageSize");
  const paginated = pageParam !== null || pageSizeParam !== null;
  const page = pageParam ? Number(pageParam) : 1;
  const pageSize = pageSizeParam ? Number(pageSizeParam) : 25;
  if (paginated && (!Number.isInteger(page) || page < 1 || page > 100000)) return NextResponse.json({ error: "Pagina invalida" }, { status: 400 });
  if (paginated && (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100)) return NextResponse.json({ error: "Tamano de pagina invalido" }, { status: 400 });

  // Construir filtros
  const where: Prisma.PqrsWhereInput = pqrsScopeForUser({ tenantId, userId: session.user.id, role: session.user.role });

  // Scope: active = EN_ESPERA + EN_PROGRESO, historial = TERMINADO
  if (scope === "active") {
    where.estado = { in: ["EN_ESPERA", "EN_PROGRESO"] };
  } else if (scope === "historial") {
    where.estado = "TERMINADO";
  }

  if (estado && !ESTADOS_VALIDOS.has(estado)) {
    return NextResponse.json({ error: "Estado invalido" }, { status: 400 });
  }
  if (estado) {
    where.estado = estado as Prisma.EnumEstadoFilter["equals"];
  }

  if (asunto && !ASUNTOS_VALIDOS.has(asunto)) {
    return NextResponse.json({ error: "Asunto invalido" }, { status: 400 });
  }
  if (asunto) {
    where.asunto = asunto;
  }

  if (mes) {
    where.mes = mes;
  }

  const numericFilters: Array<[string | null, string, number]> = [
    [year, "Año", 2100],
    [searchBloque, "Bloque", 999],
    [searchApto, "Apartamento", 99999],
    [searchNumero, "Numero", 2147483647],
  ];
  for (const [value, label, max] of numericFilters) {
    if (value && (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > max)) {
      return NextResponse.json({ error: `${label} invalido` }, { status: 400 });
    }
  }

  if (year) {
    const yearNum = Number(year);
    where.fechaRecibido = {
      gte: new Date(`${yearNum}-01-01`),
      lt: new Date(`${yearNum + 1}-01-01`),
    };
  }

  if (searchBloque) where.bloque = Number(searchBloque);
  if (searchApto) where.apto = Number(searchApto);
  if (searchNumero) where.numero = Number(searchNumero);

  if (freeText) {
    const numericSearch = /^\d+$/.test(freeText) ? Number(freeText) : null;
    const searchCondition: Prisma.PqrsWhereInput = {
      OR: [
        { titulo: { contains: freeText, mode: "insensitive" } },
        { asunto: { contains: freeText, mode: "insensitive" } },
        { nombreResidente: { contains: freeText, mode: "insensitive" } },
        { descripcion: { contains: freeText, mode: "insensitive" } },
        ...(numericSearch !== null ? [{ numero: numericSearch }, { bloque: numericSearch }, { apto: numericSearch }] : []),
      ],
    };
    where.AND = [searchCondition];
  }

  const query = {
    where,
    orderBy: { fechaRecibido: "desc" as const },
    ...(paginated ? { skip: (page - 1) * pageSize, take: pageSize } : {}),
    include: {
      creadoPor: { select: { name: true } },
      gestionadoPor: { select: { name: true } },
    },
  };
  const [pqrs, total] = await Promise.all([
    prisma.pqrs.findMany(query),
    paginated ? prisma.pqrs.count({ where }) : Promise.resolve(0),
  ]);
  const data = session.user.role === "RESIDENTE" ? pqrs.map(toResidentPqrsView) : pqrs.map(withoutStorageUrls);
  if (paginated) {
    return NextResponse.json({
      data,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  }
  return NextResponse.json(data);
}

async function handlePost(req: NextRequest) {
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

  const body = await req.json().catch(() => null);
  if (!isRecord(body)) {
    return NextResponse.json({ error: "Cuerpo invalido" }, { status: 400 });
  }
  const { titulo, asunto, descripcion, nombreResidente, bloque, apto, fotos } = body;
  if (typeof descripcion !== "string" || !descripcion.trim()) {
    return NextResponse.json({ error: "La descripcion es obligatoria" }, { status: 400 });
  }
  const finalDescripcion = descripcion.trim();
  if (finalDescripcion.length > 6000 || finalDescripcion.split(/\s+/).length > 300) {
    return NextResponse.json(
      { error: "La descripcion no puede superar 300 palabras ni 6000 caracteres" },
      { status: 400 }
    );
  }
  let finalTitulo: string | undefined;
  try {
    finalTitulo = optionalBoundedText(titulo, "Titulo", 120);
  } catch (error) {
    const message = error instanceof PqrsValidationError ? error.message : "Datos invalidos";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const isAdmin = session.user.role === "ADMIN";

  // ADMIN crea a nombre de un residente (manual)
  // RESIDENTE usa sus datos de sesion
  const finalNombre = isAdmin
    ? typeof nombreResidente === "string" ? nombreResidente.trim() : ""
    : session.user.name?.trim() || "";
  if (asunto !== undefined && asunto !== null && (typeof asunto !== "string" || !ASUNTOS_VALIDOS.has(asunto))) {
    return NextResponse.json({ error: "Asunto invalido" }, { status: 400 });
  }
  if (!isAdmin && (typeof asunto !== "string" || !ASUNTOS_VALIDOS.has(asunto))) {
    return NextResponse.json({ error: "Debes seleccionar una categoria" }, { status: 400 });
  }
  const parsePositiveInteger = (value: unknown, max: number) => {
    const raw = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
    if (!/^\d+$/.test(raw)) return null;
    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed >= 1 && parsed <= max ? parsed : null;
  };
  const finalBloque = isAdmin ? parsePositiveInteger(bloque, 999) : session.user.bloque;
  const finalApto = isAdmin ? parsePositiveInteger(apto, 99999) : session.user.apto;

  if (!finalNombre || finalNombre.length > 160 || finalBloque === null || finalBloque === undefined || finalApto === null || finalApto === undefined) {
    return NextResponse.json({ error: "Nombre, bloque y apartamento son obligatorios y validos" }, { status: 400 });
  }

  const fotosArray: { buffer: Buffer; nombre: string; tipo: string; orden: number }[] = [];
  if (fotos !== undefined && !Array.isArray(fotos)) {
    return NextResponse.json({ error: "Formato de fotos invalido" }, { status: 400 });
  }
  if (Array.isArray(fotos)) {
    if (fotos.length > 3) {
      return NextResponse.json({ error: "Maximo 3 fotos permitidas" }, { status: 400 });
    }
    try {
      for (let i = 0; i < fotos.length; i++) {
        const foto = fotos[i];
        if (!isRecord(foto)) throw new PqrsValidationError("Datos de foto incompletos");
        const validated = validatePqrsFile({
          dataUrl: foto.data,
          fileName: foto.nombre,
          allowedTypes: ALLOWED_IMAGE_TYPES,
          maxBytes: 1024 * 1024,
        });
        if (foto.tipo !== validated.contentType) {
          throw new PqrsValidationError("El contenido no coincide con el tipo declarado");
        }
        fotosArray.push({
          buffer: validated.buffer,
          nombre: validated.fileName,
          tipo: validated.contentType,
          orden: i,
        });
      }
    } catch (error) {
      const message = error instanceof PqrsValidationError ? error.message : "Datos de foto invalidos";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  const ahora = new Date();

  const storedFotos: {
    url: string | null;
    storagePath: string;
    nombre: string;
    tipo: string;
    size: number;
    orden: number;
  }[] = [];
  const cleanupStoredFotos = async () => {
    await Promise.allSettled(
      storedFotos.map((foto) =>
        deleteFromStorage(foto.storagePath, { tenantId, folders: ["fotos"] })
      )
    );
  };
  try {
    for (const foto of fotosArray) {
      const stored = await uploadToStorage({
        tenantId,
        folder: "fotos",
        fileName: foto.nombre,
        contentType: foto.tipo,
        buffer: foto.buffer,
      });
      storedFotos.push({
        url: null,
        storagePath: stored.path,
        nombre: stored.fileName,
        tipo: stored.contentType,
        size: stored.size,
        orden: foto.orden,
      });
    }
  } catch {
    await cleanupStoredFotos();
    console.error("[pqrs/create] No se pudieron subir las fotos");
    return NextResponse.json({ error: "No se pudieron subir las fotos" }, { status: 500 });
  }

  let pqrs;
  try {
    pqrs = await prisma.$transaction(async (tx) => {
    const nuevoPqrs = await tx.pqrs.create({
      data: {
        tenantId,
        medio: "PLATAFORMA_WEB",
        fechaRecibido: ahora,
        mes: MESES[ahora.getMonth()],
        bloque: finalBloque,
        apto: finalApto,
        nombreResidente: finalNombre,
        titulo: finalTitulo || null,
        asunto: typeof asunto === "string" ? asunto : null,
        descripcion: finalDescripcion,
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
  } catch {
    await cleanupStoredFotos();
    console.error("[pqrs/create] No se pudo persistir la solicitud");
    return NextResponse.json({ error: "No se pudo crear la PQRS" }, { status: 500 });
  }

  await registerAuditLog({
    actorUserId: session.user.id,
    tenantId,
    action: AuditAction.PQRS_CREATED,
    targetType: "Pqrs",
    targetId: pqrs.id,
    metadata: { numero: pqrs.numero, asunto: pqrs.asunto, estado: pqrs.estado },
  });

  const recipients = (await prisma.tenantMembership.findMany({
    where: { tenantId, role: "ADMIN", isActive: true },
    select: { userId: true, role: true, notifyNewPqrsEmail: true, user: { select: { email: true } } },
  })).map((membership) => ({
    id: membership.userId,
    role: membership.role,
    email: membership.user.email,
    notifyNewPqrsEmail: membership.notifyNewPqrsEmail,
  }));

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
          html: renderEmailLayout({
            accent: "warning",
            eyebrow: "Nueva PQRS",
            heading: escapePqrsHtml(pqrs.titulo || `Solicitud #${pqrs.numero}`),
            bodyHtml: `
              <p>Se registró la solicitud <strong>#${pqrs.numero}</strong>${pqrs.asunto ? ` — ${pqrs.asunto}` : ""}, radicada por <strong>${escapePqrsHtml(finalNombre)}</strong> (Bloque ${finalBloque}, apto ${finalApto}).</p>
              <p>Ingresa al panel de administración para revisarla y dar el primer contacto.</p>
            `,
            cta: { label: "Ver en el panel", url: `${process.env.APP_URL || process.env.NEXTAUTH_URL || ""}/admin/pqrs?id=${pqrs.id}` },
            footerNote: "Puedes desactivar este correo en Mi cuenta → Notificaciones.",
          }),
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
        html: renderEmailLayout({
          accent: "navy",
          eyebrow: "Solicitud recibida",
          heading: escapePqrsHtml(pqrs.titulo || "Recibimos tu solicitud"),
          bodyHtml: `
            <p>Hola <strong>${escapePqrsHtml(finalNombre)}</strong>,</p>
            <p>Ya recibimos tu PQRS y en breve la administración se pondrá en contacto contigo. Te avisaremos por correo tan pronto quede radicada oficialmente.</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border-collapse:separate;border-spacing:0;background:#F5F5F7;border-radius:12px;overflow:hidden;">
              <tr><td style="padding:12px 16px;font-size:12px;color:#8E8E93;font-weight:700;width:40%;">NÚMERO INTERNO</td><td style="padding:12px 16px;font-size:13px;font-weight:700;color:#1D1D1F;">#${pqrs.numero}</td></tr>
              <tr><td style="padding:12px 16px;font-size:12px;color:#8E8E93;font-weight:700;border-top:1px solid #E5E5EA;">UBICACIÓN</td><td style="padding:12px 16px;font-size:13px;font-weight:700;color:#1D1D1F;border-top:1px solid #E5E5EA;">Bloque ${finalBloque}, apto ${finalApto}</td></tr>
            </table>
            <div style="background:#EAEEF6;border-radius:12px;padding:16px 18px;">
              <p style="margin:0;font-size:13.5px;color:#122545;line-height:1.6;">${escapePqrsHtml(finalDescripcion)}</p>
            </div>
          `,
        }),
      });
    } catch (emailError) {
      console.error("Error enviando email de recepcion:", emailError);
    }
  }

  return NextResponse.json(withoutStorageUrls(pqrs), { status: 201 });
}

export async function GET(req: NextRequest) {
  try {
    return await handleGet(req);
  } catch {
    console.error("[pqrs/list] Error inesperado");
    return NextResponse.json({ error: "No se pudieron obtener las PQRS" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    return await handlePost(req);
  } catch {
    console.error("[pqrs/create] Error inesperado");
    return NextResponse.json({ error: "No se pudo crear la PQRS" }, { status: 500 });
  }
}

