import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma, TipoPqrs } from "@prisma/client";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const estado = searchParams.get("estado");
  const tipo = searchParams.get("tipo");
  const year = searchParams.get("year");

  // Construir filtros
  const where: Prisma.PqrsWhereInput = {};

  // RESIDENTE solo ve sus propias PQRS
  if (session.user.role === "RESIDENTE") {
    where.creadoPorId = session.user.id;
  }

  if (estado) {
    where.estado = estado as Prisma.EnumEstadoFilter["equals"];
  }

  if (tipo) {
    where.tipoPqrs = tipo as Prisma.EnumTipoPqrsFilter["equals"];
  }

  if (year) {
    const yearNum = parseInt(year);
    where.fechaRecibido = {
      gte: new Date(`${yearNum}-01-01`),
      lt: new Date(`${yearNum + 1}-01-01`),
    };
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

  // Solo ADMIN y RESIDENTE pueden crear
  if (session.user.role !== "ADMIN" && session.user.role !== "RESIDENTE") {
    return NextResponse.json({ error: "No tiene permisos" }, { status: 403 });
  }

  const body = await req.json();
  const { tipoPqrs, asunto, descripcion, nombreResidente, bloque, apto } = body;

  // Validaciones
  if (!tipoPqrs || !asunto || !descripcion) {
    return NextResponse.json(
      { error: "Tipo, asunto y descripción son obligatorios" },
      { status: 400 }
    );
  }

  if (!Object.values(TipoPqrs).includes(tipoPqrs)) {
    return NextResponse.json({ error: "Tipo de PQRS inválido" }, { status: 400 });
  }

  const isAdmin = session.user.role === "ADMIN";

  // ADMIN crea a nombre de un residente (manual)
  // RESIDENTE usa sus datos de sesión
  const finalNombre = isAdmin ? nombreResidente : session.user.name;
  const finalBloque = isAdmin ? parseInt(bloque) : session.user.bloque;
  const finalApto = isAdmin ? parseInt(apto) : session.user.apto;

  if (!finalNombre || !finalBloque || !finalApto) {
    return NextResponse.json(
      { error: "Nombre, torre y apartamento son obligatorios" },
      { status: 400 }
    );
  }

  if (finalBloque < 1 || finalBloque > 12) {
    return NextResponse.json({ error: "Torre debe ser entre 1 y 12" }, { status: 400 });
  }

  const ahora = new Date();

  const pqrs = await prisma.pqrs.create({
    data: {
      medio: "PLATAFORMA_WEB",
      fechaRecibido: ahora,
      mes: MESES[ahora.getMonth()],
      bloque: finalBloque,
      apto: finalApto,
      nombreResidente: finalNombre,
      tipoPqrs,
      asunto,
      descripcion,
      creadoPorId: session.user.id,
    },
  });

  // Registrar en historial
  await prisma.historialPqrs.create({
    data: {
      pqrsId: pqrs.id,
      estadoDespues: "EN_ESPERA",
      nota: `PQRS creada por ${isAdmin ? "administración" : "residente"}`,
    },
  });

  return NextResponse.json(pqrs, { status: 201 });
}
