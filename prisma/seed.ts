import { PrismaClient, Role, TipoPqrs, Estado, Medio } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Limpiando base de datos...");

  await prisma.historialPqrs.deleteMany();
  await prisma.pqrs.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.verificationToken.deleteMany();
  await prisma.user.deleteMany();

  const hash = (pw: string) => bcrypt.hashSync(pw, 10);

  // Crear usuarios
  const admin = await prisma.user.create({
    data: {
      email: "admoncallecien@gmail.com",
      password: hash("REDACTED_HISTORICAL_PASSWORD"),
      name: "Administración Calle 100",
      role: Role.ADMIN,
    },
  });

  await prisma.user.create({
    data: {
      email: "d.hernandeza2@uniandes.edu.co",
      password: hash("REDACTED_HISTORICAL_PASSWORD"),
      name: "David Hernández",
      role: Role.ADMIN,
    },
  });

  await prisma.user.create({
    data: {
      email: "consejo@calle100.com",
      password: hash("REDACTED_HISTORICAL_PASSWORD"),
      name: "Carlos Rodríguez",
      role: Role.CONSEJO,
    },
  });

  const residente1 = await prisma.user.create({
    data: {
      email: "residente1@calle100.com",
      password: hash("REDACTED_HISTORICAL_PASSWORD"),
      name: "Ana Martínez",
      role: Role.RESIDENTE,
      bloque: 5,
      apto: 310,
    },
  });

  const residente2 = await prisma.user.create({
    data: {
      email: "residente2@calle100.com",
      password: hash("REDACTED_HISTORICAL_PASSWORD"),
      name: "Luis Pérez",
      role: Role.RESIDENTE,
      bloque: 7,
      apto: 218,
    },
  });

  const residente3 = await prisma.user.create({
    data: {
      email: "residente3@calle100.com",
      password: hash("REDACTED_HISTORICAL_PASSWORD"),
      name: "Sandra López",
      role: Role.RESIDENTE,
      bloque: 12,
      apto: 512,
    },
  });

  console.log("Usuarios creados: 6");

  // PQRS con los nuevos campos asunto/subAsunto/numeroRadicacion
  const pqrsData = [
    // EN_ESPERA (3 pendientes)
    {
      medio: Medio.PLATAFORMA_WEB,
      fechaRecibido: new Date("2026-03-18"),
      mes: "Marzo",
      bloque: 3, apto: 502,
      nombreResidente: "María García",
      tipoPqrs: TipoPqrs.QUEJA,
      asunto: "Humedad",
      subAsunto: "Humedad Ventana",
      descripcion: "Se presenta humedad en la ventana del cuarto principal. El agua se filtra cuando llueve y ha generado moho.",
      estado: Estado.EN_ESPERA,
      creadoPorId: residente1.id,
    },
    {
      medio: Medio.PLATAFORMA_WEB,
      fechaRecibido: new Date("2026-03-19"),
      mes: "Marzo",
      bloque: 7, apto: 301,
      nombreResidente: "Carlos López",
      tipoPqrs: TipoPqrs.PETICION,
      asunto: "Iluminación",
      descripcion: "Solicito la instalación de luces LED en el parqueadero del sótano 2. Actualmente muy oscuro.",
      estado: Estado.EN_ESPERA,
      creadoPorId: residente2.id,
    },
    {
      medio: Medio.PLATAFORMA_WEB,
      fechaRecibido: new Date("2026-03-20"),
      mes: "Marzo",
      bloque: 1, apto: 204,
      nombreResidente: "Ana Martínez",
      tipoPqrs: TipoPqrs.RECLAMO,
      asunto: "Área común",
      descripcion: "El salón comunal fue reservado para el sábado pero estaba ocupado por otra reunión no programada.",
      estado: Estado.EN_ESPERA,
      creadoPorId: residente3.id,
    },

    // EN_PROGRESO (2 radicadas)
    {
      medio: Medio.PLATAFORMA_WEB,
      fechaRecibido: new Date("2026-03-10"),
      mes: "Marzo",
      bloque: 5, apto: 101,
      nombreResidente: "Pedro Ramírez",
      tipoPqrs: TipoPqrs.QUEJA,
      asunto: "Convivencia",
      descripcion: "El vecino del apto 102 tiene música a alto volumen después de las 10pm constantemente.",
      estado: Estado.EN_PROGRESO,
      fechaPrimerContacto: new Date("2026-03-12"),
      tiempoRespuestaPrimerContacto: 2,
      gestionadoPorId: admin.id,
      numeroRadicacion: "RAD-2026-0004",
      creadoPorId: residente1.id,
    },
    {
      medio: Medio.PLATAFORMA_WEB,
      fechaRecibido: new Date("2026-03-05"),
      mes: "Marzo",
      bloque: 9, apto: 803,
      nombreResidente: "Laura Sánchez",
      tipoPqrs: TipoPqrs.PETICION,
      asunto: "Humedad",
      subAsunto: "Humedad Sala",
      descripcion: "Humedad en la pared de la sala que da hacia el pasillo. Requiero inspección técnica.",
      estado: Estado.EN_PROGRESO,
      fechaPrimerContacto: new Date("2026-03-06"),
      tiempoRespuestaPrimerContacto: 1,
      gestionadoPorId: admin.id,
      numeroRadicacion: "RAD-2026-0005",
      creadoPorId: residente2.id,
    },

    // TERMINADAS (5 cerradas en ene/feb/mar)
    {
      medio: Medio.PLATAFORMA_WEB,
      fechaRecibido: new Date("2026-01-05"),
      mes: "Enero",
      bloque: 6, apto: 201,
      nombreResidente: "Valentina Ruiz",
      tipoPqrs: TipoPqrs.PETICION,
      asunto: "Convivencia",
      descripcion: "Solicito copia del reglamento de propiedad horizontal y actas de las últimas 3 asambleas.",
      estado: Estado.TERMINADO,
      fechaPrimerContacto: new Date("2026-01-06"),
      tiempoRespuestaPrimerContacto: 1,
      accionTomada: "Se entregaron los documentos solicitados vía email.",
      evidenciaCierre: "Correo enviado con documentos adjuntos.",
      fechaCierre: new Date("2026-01-08"),
      tiempoRespuestaCierre: 3,
      gestionadoPorId: admin.id,
      numeroRadicacion: "RAD-2026-0006",
      creadoPorId: residente3.id,
    },
    {
      medio: Medio.PLATAFORMA_WEB,
      fechaRecibido: new Date("2026-01-15"),
      mes: "Enero",
      bloque: 11, apto: 903,
      nombreResidente: "Diego Torres",
      tipoPqrs: TipoPqrs.QUEJA,
      asunto: "Humedad",
      subAsunto: "Humedad Depósito",
      descripcion: "Mi depósito en el sótano presenta humedad severa. Los objetos se están dañando.",
      estado: Estado.TERMINADO,
      fechaPrimerContacto: new Date("2026-01-16"),
      tiempoRespuestaPrimerContacto: 1,
      accionTomada: "Se impermeabilizó el depósito. Se instaló deshumidificador y ventilación.",
      evidenciaCierre: "Obra de impermeabilización completada. Informe técnico entregado.",
      fechaCierre: new Date("2026-01-30"),
      tiempoRespuestaCierre: 15,
      gestionadoPorId: admin.id,
      numeroRadicacion: "RAD-2026-0007",
      creadoPorId: residente2.id,
    },
    {
      medio: Medio.PLATAFORMA_WEB,
      fechaRecibido: new Date("2026-02-01"),
      mes: "Febrero",
      bloque: 2, apto: 401,
      nombreResidente: "Juan Pérez",
      tipoPqrs: TipoPqrs.SUGERENCIA,
      asunto: "Área común",
      descripcion: "Sugiero instalar bancas en la zona verde cerca de la torre 2.",
      estado: Estado.TERMINADO,
      fechaPrimerContacto: new Date("2026-02-02"),
      tiempoRespuestaPrimerContacto: 1,
      accionTomada: "Se aprobó instalación de 3 bancas. Obra completada el 15 de febrero.",
      evidenciaCierre: "Bancas instaladas y verificadas.",
      fechaCierre: new Date("2026-02-15"),
      tiempoRespuestaCierre: 14,
      gestionadoPorId: admin.id,
      numeroRadicacion: "RAD-2026-0008",
      creadoPorId: residente1.id,
    },
    {
      medio: Medio.PLATAFORMA_WEB,
      fechaRecibido: new Date("2026-02-10"),
      mes: "Febrero",
      bloque: 4, apto: 602,
      nombreResidente: "Sofía Hernández",
      tipoPqrs: TipoPqrs.RECLAMO,
      asunto: "Iluminación",
      descripcion: "Las luces del pasillo del piso 6 torre 4 llevan 3 semanas dañadas.",
      estado: Estado.TERMINADO,
      fechaPrimerContacto: new Date("2026-02-11"),
      tiempoRespuestaPrimerContacto: 1,
      accionTomada: "Se reemplazaron 4 luminarias del pasillo por luces LED nuevas.",
      evidenciaCierre: "Luminarias reemplazadas. Funcionamiento verificado.",
      fechaCierre: new Date("2026-02-18"),
      tiempoRespuestaCierre: 8,
      gestionadoPorId: admin.id,
      numeroRadicacion: "RAD-2026-0009",
      creadoPorId: residente3.id,
    },
    {
      medio: Medio.PLATAFORMA_WEB,
      fechaRecibido: new Date("2026-01-20"),
      mes: "Enero",
      bloque: 8, apto: 704,
      nombreResidente: "Andrés Morales",
      tipoPqrs: TipoPqrs.SUGERENCIA,
      asunto: "Área común",
      descripcion: "Propongo habilitar espacio de coworking en el salón comunal en las mañanas.",
      estado: Estado.TERMINADO,
      fechaPrimerContacto: new Date("2026-01-22"),
      tiempoRespuestaPrimerContacto: 2,
      accionTomada: "Aprobado en comité. Se habilitó WiFi y tomas eléctricas en salón comunal.",
      evidenciaCierre: "Acta de comité. Adecuaciones completadas el 10 de febrero.",
      fechaCierre: new Date("2026-02-10"),
      tiempoRespuestaCierre: 21,
      gestionadoPorId: admin.id,
      numeroRadicacion: "RAD-2026-0010",
      creadoPorId: residente1.id,
    },
  ];

  for (const data of pqrsData) {
    const pqrs = await prisma.pqrs.create({ data });

    // Historial: creación
    await prisma.historialPqrs.create({
      data: {
        pqrsId: pqrs.id,
        estadoDespues: Estado.EN_ESPERA,
        nota: "PQRS creada",
        creadoAt: data.fechaRecibido,
      },
    });

    if (data.estado === Estado.EN_PROGRESO || data.estado === Estado.TERMINADO) {
      await prisma.historialPqrs.create({
        data: {
          pqrsId: pqrs.id,
          estadoAntes: Estado.EN_ESPERA,
          estadoDespues: Estado.EN_PROGRESO,
          nota: `PQRS radicada como ${data.numeroRadicacion}`,
          creadoAt: data.fechaPrimerContacto || data.fechaRecibido,
        },
      });
    }

    if (data.estado === Estado.TERMINADO) {
      await prisma.historialPqrs.create({
        data: {
          pqrsId: pqrs.id,
          estadoAntes: Estado.EN_PROGRESO,
          estadoDespues: Estado.TERMINADO,
          nota: "PQRS cerrada",
          creadoAt: data.fechaCierre || data.fechaRecibido,
        },
      });
    }
  }

  console.log(`${pqrsData.length} PQRS creadas con historial.`);
  console.log("\n--- Credenciales ---");
  console.log("ADMIN:     admoncallecien@gmail.com / REDACTED_HISTORICAL_PASSWORD");
  console.log("ADMIN:     d.hernandeza2@uniandes.edu.co / REDACTED_HISTORICAL_PASSWORD");
  console.log("CONSEJO:   consejo@calle100.com / REDACTED_HISTORICAL_PASSWORD");
  console.log("RESIDENTE: residente1@calle100.com / REDACTED_HISTORICAL_PASSWORD");
  console.log("RESIDENTE: residente2@calle100.com / REDACTED_HISTORICAL_PASSWORD");
  console.log("RESIDENTE: residente3@calle100.com / REDACTED_HISTORICAL_PASSWORD");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
