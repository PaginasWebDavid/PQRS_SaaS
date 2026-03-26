import { PrismaClient, Role, Estado, Medio } from "@prisma/client";
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
      email: "consejoadmoncallecien@gmail.com",
      password: hash("REDACTED_HISTORICAL_PASSWORD"),
      name: "Presidente del Consejo",
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

  // PQRS con nuevos asuntos (sin tipoPqrs, sin prefijo RAD)
  const pqrsData = [
    // EN_ESPERA (3 pendientes)
    {
      medio: Medio.PLATAFORMA_WEB,
      fechaRecibido: new Date("2026-03-18"),
      mes: "Marzo",
      bloque: 3, apto: 502,
      nombreResidente: "María García",
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
      descripcion: "Solicito revisión de la contabilidad del trimestre pasado. Los valores de la cuota de administración no coinciden.",
      estado: Estado.EN_ESPERA,
      creadoPorId: residente2.id,
    },
    {
      medio: Medio.PLATAFORMA_WEB,
      fechaRecibido: new Date("2026-03-20"),
      mes: "Marzo",
      bloque: 1, apto: 204,
      nombreResidente: "Ana Martínez",
      descripcion: "El salón comunal fue reservado para el sábado pero estaba ocupado por otra reunión no programada.",
      estado: Estado.EN_ESPERA,
      creadoPorId: residente3.id,
    },

    // EN_PROGRESO (2 radicadas con fases)
    {
      medio: Medio.PLATAFORMA_WEB,
      fechaRecibido: new Date("2026-03-10"),
      mes: "Marzo",
      bloque: 5, apto: 101,
      nombreResidente: "Pedro Ramírez",
      asunto: "CONVIVENCIA",
      descripcion: "El vecino del apto 102 tiene música a alto volumen después de las 10pm constantemente.",
      estado: Estado.EN_PROGRESO,
      fechaPrimerContacto: new Date("2026-03-12"),
      tiempoRespuestaPrimerContacto: 2,
      notaPrimerContacto: "Se contactó al residente y se programó visita de verificación.",
      gestionadoPorId: admin.id,
      numeroRadicacion: "2026-0004",
      faseActual: 1,
      faseTipo: null,
      fase1Inicio: new Date("2026-03-12"),
      creadoPorId: residente1.id,
    },
    {
      medio: Medio.PLATAFORMA_WEB,
      fechaRecibido: new Date("2026-03-05"),
      mes: "Marzo",
      bloque: 9, apto: 803,
      nombreResidente: "Laura Sánchez",
      asunto: "HUMEDAD/FACHADA",
      subAsunto: "Humedad en pared de la sala",
      descripcion: "Humedad en la pared de la sala que da hacia el pasillo. Requiero inspección técnica.",
      estado: Estado.EN_PROGRESO,
      fechaPrimerContacto: new Date("2026-03-06"),
      tiempoRespuestaPrimerContacto: 1,
      notaPrimerContacto: "Se programó inspección técnica para evaluar la humedad.",
      gestionadoPorId: admin.id,
      numeroRadicacion: "2026-0005",
      faseActual: 2,
      faseTipo: "INSUMOS",
      fase1Inicio: new Date("2026-03-06"),
      fase2Inicio: new Date("2026-03-10"),
      creadoPorId: residente2.id,
    },

    // TERMINADAS (5 cerradas en ene/feb/mar)
    {
      medio: Medio.PLATAFORMA_WEB,
      fechaRecibido: new Date("2026-01-05"),
      mes: "Enero",
      bloque: 6, apto: 201,
      nombreResidente: "Valentina Ruiz",
      asunto: "CONVIVENCIA",
      descripcion: "Solicito copia del reglamento de propiedad horizontal y actas de las últimas 3 asambleas.",
      estado: Estado.TERMINADO,
      fechaPrimerContacto: new Date("2026-01-06"),
      tiempoRespuestaPrimerContacto: 1,
      notaPrimerContacto: "Se recibió la solicitud y se procede a recopilar documentos.",
      accionTomada: "Se entregaron los documentos solicitados vía email.",
      evidenciaCierre: "Correo enviado con documentos adjuntos.",
      fechaCierre: new Date("2026-01-08"),
      tiempoRespuestaCierre: 3,
      gestionadoPorId: admin.id,
      numeroRadicacion: "2026-0006",
      faseActual: 5,
      fase1Inicio: new Date("2026-01-06"),
      fase4Inicio: new Date("2026-01-07"),
      fase5Inicio: new Date("2026-01-08"),
      creadoPorId: residente3.id,
    },
    {
      medio: Medio.PLATAFORMA_WEB,
      fechaRecibido: new Date("2026-01-15"),
      mes: "Enero",
      bloque: 11, apto: 903,
      nombreResidente: "Diego Torres",
      asunto: "HUMEDAD/DEPOSITO",
      subAsunto: "Humedad severa en depósito del sótano",
      descripcion: "Mi depósito en el sótano presenta humedad severa. Los objetos se están dañando.",
      estado: Estado.TERMINADO,
      fechaPrimerContacto: new Date("2026-01-16"),
      tiempoRespuestaPrimerContacto: 1,
      notaPrimerContacto: "Se programó inspección del depósito para el día siguiente.",
      accionTomada: "Se impermeabilizó el depósito. Se instaló deshumidificador y ventilación.",
      evidenciaCierre: "Obra de impermeabilización completada. Informe técnico entregado.",
      fechaCierre: new Date("2026-01-30"),
      tiempoRespuestaCierre: 15,
      gestionadoPorId: admin.id,
      numeroRadicacion: "2026-0007",
      faseActual: 5,
      faseTipo: "INSUMOS",
      fase1Inicio: new Date("2026-01-16"),
      fase2Inicio: new Date("2026-01-18"),
      fase4Inicio: new Date("2026-01-22"),
      fase5Inicio: new Date("2026-01-30"),
      creadoPorId: residente2.id,
    },
    {
      medio: Medio.PLATAFORMA_WEB,
      fechaRecibido: new Date("2026-02-01"),
      mes: "Febrero",
      bloque: 2, apto: 401,
      nombreResidente: "Juan Pérez",
      asunto: "AREA COMUN",
      descripcion: "Sugiero instalar bancas en la zona verde cerca de la torre 2.",
      estado: Estado.TERMINADO,
      fechaPrimerContacto: new Date("2026-02-02"),
      tiempoRespuestaPrimerContacto: 1,
      notaPrimerContacto: "Se recibió sugerencia y se trasladó al comité de convivencia.",
      accionTomada: "Se aprobó instalación de 3 bancas. Obra completada el 15 de febrero.",
      evidenciaCierre: "Bancas instaladas y verificadas.",
      fechaCierre: new Date("2026-02-15"),
      tiempoRespuestaCierre: 14,
      gestionadoPorId: admin.id,
      numeroRadicacion: "2026-0008",
      faseActual: 5,
      faseTipo: "PROVEEDOR",
      fase1Inicio: new Date("2026-02-02"),
      fase3Inicio: new Date("2026-02-05"),
      fase4Inicio: new Date("2026-02-08"),
      fase5Inicio: new Date("2026-02-15"),
      creadoPorId: residente1.id,
    },
    {
      medio: Medio.PLATAFORMA_WEB,
      fechaRecibido: new Date("2026-02-10"),
      mes: "Febrero",
      bloque: 4, apto: 602,
      nombreResidente: "Sofía Hernández",
      asunto: "AREA COMUN",
      descripcion: "Las luces del pasillo del piso 6 torre 4 llevan 3 semanas dañadas.",
      estado: Estado.TERMINADO,
      fechaPrimerContacto: new Date("2026-02-11"),
      tiempoRespuestaPrimerContacto: 1,
      notaPrimerContacto: "Se reportó a mantenimiento para revisión inmediata.",
      accionTomada: "Se reemplazaron 4 luminarias del pasillo por luces LED nuevas.",
      evidenciaCierre: "Luminarias reemplazadas. Funcionamiento verificado.",
      fechaCierre: new Date("2026-02-18"),
      tiempoRespuestaCierre: 8,
      gestionadoPorId: admin.id,
      numeroRadicacion: "2026-0009",
      faseActual: 5,
      faseTipo: "INSUMOS",
      fase1Inicio: new Date("2026-02-11"),
      fase2Inicio: new Date("2026-02-12"),
      fase4Inicio: new Date("2026-02-14"),
      fase5Inicio: new Date("2026-02-18"),
      creadoPorId: residente3.id,
    },
    {
      medio: Medio.PLATAFORMA_WEB,
      fechaRecibido: new Date("2026-01-20"),
      mes: "Enero",
      bloque: 8, apto: 704,
      nombreResidente: "Andrés Morales",
      asunto: "CONTABILIDAD",
      descripcion: "Solicito aclaración sobre el cobro extra de $50.000 en la cuota de enero.",
      estado: Estado.TERMINADO,
      fechaPrimerContacto: new Date("2026-01-22"),
      tiempoRespuestaPrimerContacto: 2,
      notaPrimerContacto: "Se recibió solicitud y se trasladó a contabilidad para revisión.",
      accionTomada: "Se verificó el cobro y se realizó ajuste en la siguiente factura.",
      evidenciaCierre: "Nota crédito emitida. Ajuste aplicado en cuota de febrero.",
      fechaCierre: new Date("2026-02-10"),
      tiempoRespuestaCierre: 21,
      gestionadoPorId: admin.id,
      numeroRadicacion: "2026-0010",
      faseActual: 5,
      fase1Inicio: new Date("2026-01-22"),
      fase4Inicio: new Date("2026-01-25"),
      fase5Inicio: new Date("2026-02-10"),
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
          nota: `Primer contacto: ${data.notaPrimerContacto || "PQRS radicada"}`,
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
  console.log("CONSEJO:   consejoadmoncallecien@gmail.com / REDACTED_HISTORICAL_PASSWORD");
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
