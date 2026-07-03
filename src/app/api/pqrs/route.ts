import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTenantIdFromSession } from "@/domains/organizations/tenant.service";
import { getTenantAccessResponse } from "@/lib/tenant-access-response";
import { dataUrlToBuffer, uploadToStorage } from "@/lib/storage";
import { Prisma } from "@prisma/client";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
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
  const where: Prisma.PqrsWhereInput = { tenantId };

  // RESIDENTE solo ve sus propias PQRS
  if (session.user.role === "RESIDENTE") {
    where.creadoPorId = session.user.id;
  }

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
    },
  });

  return NextResponse.json(pqrs);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const tenantAccessResponse = await getTenantAccessResponse(session);
  if (tenantAccessResponse) return tenantAccessResponse;

  const tenantId = getTenantIdFromSession(session);

  // Solo ADMIN y RESIDENTE pueden crear
  if (session.user.role !== "ADMIN" && session.user.role !== "RESIDENTE") {
    return NextResponse.json({ error: "No tiene permisos" }, { status: 403 });
  }

  const body = await req.json();
  const { asunto, descripcion, nombreResidente, bloque, apto, fotos } = body;

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

  if (finalBloque < 1 || finalBloque > 12) {
    return NextResponse.json({ error: "Bloque debe ser entre 1 y 12" }, { status: 400 });
  }

  // Validar fotos opcionales
  const fotosArray: { data: string; nombre: string; tipo: string; orden: number }[] = [];
  if (fotos && Array.isArray(fotos)) {
    if (fotos.length > 3) {
      return NextResponse.json({ error: "MÃ¡ximo 3 fotos permitidas" }, { status: 400 });
    }
    for (let i = 0; i < fotos.length; i++) {
      const foto = fotos[i];
      if (!foto.data || !foto.nombre || !foto.tipo) {
        return NextResponse.json({ error: "Datos de foto incompletos" }, { status: 400 });
      }
      if (!foto.tipo.startsWith("image/")) {
        return NextResponse.json({ error: "Solo se permiten archivos de imagen" }, { status: 400 });
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
        asunto: asunto || null,
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

  return NextResponse.json(pqrs, { status: 201 });
}