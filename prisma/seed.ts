import { PrismaClient, Role, TipoPqrs, Estado, Medio } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Limpiar datos existentes
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
      email: "d.hernandeza2@uniandes.edu.co",
      password: hash("REDACTED_HISTORICAL_PASSWORD"),
      name: "David Hernández",
      role: Role.ADMIN,
    },
  });

  const asistente = await prisma.user.create({
    data: {
      email: "asistente@calle100.com",
      password: hash("REDACTED_HISTORICAL_PASSWORD"),
      name: "María García",
      role: Role.ASISTENTE,
    },
  });

  const consejo = await prisma.user.create({
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

  console.log("Usuarios creados:", 6);

  // Crear PQRS de prueba
  const pqrsData = [
    {
      medio: Medio.PLATAFORMA_WEB,
      fechaRecibido: new Date("2026-01-10"),
      mes: "Enero",
      bloque: 5,
      apto: 310,
      nombreResidente: "Ana Martínez",
      tipoPqrs: TipoPqrs.QUEJA,
      asunto: "Filtración de agua en el techo",
      descripcion: "Filtración de agua en el techo del apartamento, se observa humedad creciente en la esquina del baño principal.",
      estado: Estado.TERMINADO,
      accionTomada: "Se realizó inspección con el ingeniero. Se identificó falla en la impermeabilización del piso superior. Se realizó reparación y sellamiento.",
      fechaPrimerContacto: new Date("2026-01-11"),
      tiempoRespuestaPrimerContacto: 1,
      fechaCierre: new Date("2026-01-20"),
      tiempoRespuestaCierre: 8,
      evidenciaCierre: "Fotos del antes y después de la reparación. Acta firmada por el residente.",
      creadoPorId: residente1.id,
      gestionadoPorId: admin.id,
    },
    {
      medio: Medio.PLATAFORMA_WEB,
      fechaRecibido: new Date("2026-01-15"),
      mes: "Enero",
      bloque: 7,
      apto: 218,
      nombreResidente: "Luis Pérez",
      tipoPqrs: TipoPqrs.PETICION,
      asunto: "Punto de carga para vehículo eléctrico",
      descripcion: "Solicito la instalación de un punto de carga para vehículo eléctrico en mi parqueadero asignado (P-45).",
      estado: Estado.EN_PROGRESO,
      accionTomada: "Se remitió solicitud al Consejo de Administración para aprobación. Se solicitó cotización al proveedor eléctrico del conjunto.",
      fechaPrimerContacto: new Date("2026-01-16"),
      tiempoRespuestaPrimerContacto: 1,
      creadoPorId: residente2.id,
      gestionadoPorId: asistente.id,
    },
    {
      medio: Medio.PLATAFORMA_WEB,
      fechaRecibido: new Date("2026-02-01"),
      mes: "Febrero",
      bloque: 3,
      apto: 102,
      nombreResidente: "Pedro Gómez",
      tipoPqrs: TipoPqrs.QUEJA,
      asunto: "Ruido excesivo del vecino",
      descripcion: "El vecino del apartamento 103 tiene música a alto volumen después de las 10pm de forma recurrente.",
      estado: Estado.TERMINADO,
      accionTomada: "Se envió comunicado al residente del apto 103. Se programó mediación. Se firmó acta de compromiso.",
      fechaPrimerContacto: new Date("2026-02-03"),
      tiempoRespuestaPrimerContacto: 2,
      fechaCierre: new Date("2026-02-10"),
      tiempoRespuestaCierre: 7,
      evidenciaCierre: "Acta de compromiso firmada por ambas partes.",
      gestionadoPorId: admin.id,
    },
    {
      medio: Medio.PLATAFORMA_WEB,
      fechaRecibido: new Date("2026-02-05"),
      mes: "Febrero",
      bloque: 12,
      apto: 512,
      nombreResidente: "Sandra López",
      tipoPqrs: TipoPqrs.RECLAMO,
      asunto: "Humedad en ventana sin atender",
      descripcion: "Ya reporté hace 3 meses la humedad en mi ventana del cuarto principal y nadie ha venido a revisar. El problema empeoró.",
      estado: Estado.EN_PROGRESO,
      accionTomada: "Se programó visita del contratista de ventanas para el 12 de febrero.",
      fechaPrimerContacto: new Date("2026-02-06"),
      tiempoRespuestaPrimerContacto: 1,
      creadoPorId: residente3.id,
      gestionadoPorId: asistente.id,
    },
    {
      medio: Medio.PLATAFORMA_WEB,
      fechaRecibido: new Date("2026-02-10"),
      mes: "Febrero",
      bloque: 1,
      apto: 401,
      nombreResidente: "Jorge Ramírez",
      tipoPqrs: TipoPqrs.SUGERENCIA,
      asunto: "Más luminarias en parqueadero",
      descripcion: "Sugiero instalar más luminarias en el parqueadero del sótano 2. Hay zonas muy oscuras.",
      estado: Estado.EN_ESPERA,
    },
    {
      medio: Medio.PLATAFORMA_WEB,
      fechaRecibido: new Date("2026-02-15"),
      mes: "Febrero",
      bloque: 8,
      apto: 605,
      nombreResidente: "Camila Torres",
      tipoPqrs: TipoPqrs.QUEJA,
      asunto: "Ascensor fuera de servicio torre 8",
      descripcion: "El ascensor de la torre 8 lleva 5 días fuera de servicio. Tengo familiar con movilidad reducida en piso 6.",
      estado: Estado.TERMINADO,
      accionTomada: "Se contactó empresa de ascensores. Reparación realizada el 17 de febrero.",
      fechaPrimerContacto: new Date("2026-02-15"),
      tiempoRespuestaPrimerContacto: 0,
      fechaCierre: new Date("2026-02-17"),
      tiempoRespuestaCierre: 2,
      evidenciaCierre: "Informe técnico de la empresa de ascensores. Ascensor operativo.",
      gestionadoPorId: admin.id,
    },
    {
      medio: Medio.PLATAFORMA_WEB,
      fechaRecibido: new Date("2026-02-20"),
      mes: "Febrero",
      bloque: 5,
      apto: 310,
      nombreResidente: "Ana Martínez",
      tipoPqrs: TipoPqrs.PETICION,
      asunto: "Copia de acta de asamblea",
      descripcion: "Solicito copia del acta de la última asamblea general de copropietarios.",
      estado: Estado.TERMINADO,
      accionTomada: "Se envió copia digital del acta al correo de la residente.",
      fechaPrimerContacto: new Date("2026-02-20"),
      tiempoRespuestaPrimerContacto: 0,
      fechaCierre: new Date("2026-02-20"),
      tiempoRespuestaCierre: 0,
      evidenciaCierre: "Correo enviado con acta adjunta.",
      creadoPorId: residente1.id,
      gestionadoPorId: asistente.id,
    },
    {
      medio: Medio.PLATAFORMA_WEB,
      fechaRecibido: new Date("2026-03-01"),
      mes: "Marzo",
      bloque: 10,
      apto: 203,
      nombreResidente: "Roberto Silva",
      tipoPqrs: TipoPqrs.QUEJA,
      asunto: "Fuga de agua en área común torre 10",
      descripcion: "Fuga de agua en el área común del piso 2 de la torre 10, cerca de las escaleras. Piso resbaloso.",
      estado: Estado.EN_PROGRESO,
      accionTomada: "Se envió plomero. Tubería rota identificada. Reparación programada.",
      fechaPrimerContacto: new Date("2026-03-01"),
      tiempoRespuestaPrimerContacto: 0,
      gestionadoPorId: admin.id,
    },
    {
      medio: Medio.PLATAFORMA_WEB,
      fechaRecibido: new Date("2026-03-05"),
      mes: "Marzo",
      bloque: 2,
      apto: 708,
      nombreResidente: "Valentina Ruiz",
      tipoPqrs: TipoPqrs.RECLAMO,
      asunto: "Puerta de acceso torre 2 dañada",
      descripcion: "La puerta de acceso a torre 2 no cierra correctamente. Cualquier persona puede entrar sin llave.",
      estado: Estado.EN_ESPERA,
    },
    {
      medio: Medio.PLATAFORMA_WEB,
      fechaRecibido: new Date("2026-03-08"),
      mes: "Marzo",
      bloque: 6,
      apto: 415,
      nombreResidente: "Diego Morales",
      tipoPqrs: TipoPqrs.SUGERENCIA,
      asunto: "Sistema de reserva para salón comunal",
      descripcion: "Propongo implementar sistema de reserva online para el salón comunal.",
      estado: Estado.EN_ESPERA,
    },
    {
      medio: Medio.PLATAFORMA_WEB,
      fechaRecibido: new Date("2026-03-10"),
      mes: "Marzo",
      bloque: 4,
      apto: 301,
      nombreResidente: "Laura Castillo",
      tipoPqrs: TipoPqrs.QUEJA,
      asunto: "Perro suelto sin correa en zona verde",
      descripcion: "Perro suelto en zona verde sin correa. Ya mordió a otro perro. Dueño es del bloque 4.",
      estado: Estado.EN_ESPERA,
    },
    {
      medio: Medio.PLATAFORMA_WEB,
      fechaRecibido: new Date("2026-03-12"),
      mes: "Marzo",
      bloque: 9,
      apto: 104,
      nombreResidente: "Andrés Vargas",
      tipoPqrs: TipoPqrs.PETICION,
      asunto: "Estado de cuenta de administración",
      descripcion: "Solicito información sobre estado de cuenta y pagos de administración del último trimestre.",
      estado: Estado.EN_ESPERA,
    },
    {
      medio: Medio.PLATAFORMA_WEB,
      fechaRecibido: new Date("2026-03-14"),
      mes: "Marzo",
      bloque: 11,
      apto: 602,
      nombreResidente: "Patricia Mendoza",
      tipoPqrs: TipoPqrs.QUEJA,
      asunto: "Humedad severa en ventana",
      descripcion: "Humedad severa en ventana del cuarto principal. Marco oxidado, entra agua cuando llueve.",
      estado: Estado.EN_ESPERA,
    },
    {
      medio: Medio.PLATAFORMA_WEB,
      fechaRecibido: new Date("2026-03-15"),
      mes: "Marzo",
      bloque: 7,
      apto: 218,
      nombreResidente: "Luis Pérez",
      tipoPqrs: TipoPqrs.QUEJA,
      asunto: "Parqueadero de visitantes ocupado",
      descripcion: "Parqueadero de visitantes ocupado permanentemente por vehículo de residente. Lleva más de 2 semanas.",
      estado: Estado.EN_ESPERA,
      creadoPorId: residente2.id,
    },
    {
      medio: Medio.PLATAFORMA_WEB,
      fechaRecibido: new Date("2026-03-16"),
      mes: "Marzo",
      bloque: 3,
      apto: 501,
      nombreResidente: "Natalia Herrera",
      tipoPqrs: TipoPqrs.PETICION,
      asunto: "Autorización de mudanza",
      descripcion: "Solicito autorización para mudanza el sábado 21 de marzo. Necesito reservar ascensor de carga.",
      estado: Estado.EN_ESPERA,
    },
  ];

  for (const data of pqrsData) {
    await prisma.pqrs.create({ data });
  }

  console.log("PQRS creados:", pqrsData.length);

  // Crear historial para los que cambiaron de estado
  const pqrsConHistorial = await prisma.pqrs.findMany({
    where: { estado: { not: Estado.EN_ESPERA } },
  });

  for (const pqr of pqrsConHistorial) {
    await prisma.historialPqrs.create({
      data: {
        pqrsId: pqr.id,
        estadoAntes: Estado.EN_ESPERA,
        estadoDespues: Estado.EN_PROGRESO,
        nota: "PQRS recibido y en gestión",
        creadoAt: pqr.fechaPrimerContacto || pqr.fechaRecibido,
      },
    });

    if (pqr.estado === Estado.TERMINADO) {
      await prisma.historialPqrs.create({
        data: {
          pqrsId: pqr.id,
          estadoAntes: Estado.EN_PROGRESO,
          estadoDespues: Estado.TERMINADO,
          nota: "PQRS resuelto y cerrado",
          creadoAt: pqr.fechaCierre || pqr.fechaRecibido,
        },
      });
    }
  }

  console.log("Historial creado para", pqrsConHistorial.length, "PQRS");
  console.log("\nSeed completado!");
  console.log("\nUsuarios de prueba:");
  console.log("  ADMIN:      d.hernandeza2@uniandes.edu.co / REDACTED_HISTORICAL_PASSWORD");
  console.log("  ASISTENTE:  asistente@calle100.com / REDACTED_HISTORICAL_PASSWORD");
  console.log("  CONSEJO:    consejo@calle100.com / REDACTED_HISTORICAL_PASSWORD");
  console.log("  RESIDENTE:  residente1@calle100.com / REDACTED_HISTORICAL_PASSWORD");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
