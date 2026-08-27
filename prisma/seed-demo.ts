/**
 * Reconstruye el conjunto de demostracion desde cero.
 *
 * BORRA Y RECREA solo los datos del conjunto demo Calle 100. Despues crea un
 * conjunto con datos que se puedan mostrar a un cliente: seis meses de PQRS,
 * quince residentes y cinco meses de historial de pagos.
 *
 * Es repetible a proposito: la demo se ensucia al mostrarla (casos abiertos a
 * medias, notas de prueba), y volver a un estado impecable debe costar un
 * comando y no una tarde.
 *
 *   DEMO_DATABASE_URL="..." DEMO_DATABASE_MODE=calle-100 CONFIRM_DEMO_RESET=CALLE_100_DEMO npx tsx prisma/seed-demo.ts
 *
 * Solo opera sobre una base declarada explicitamente como demo. Nunca debe
 * apuntar a la base operativa de Supabase.
 */
import "dotenv/config";
import { PrismaClient, Estado, Prioridad, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const CONJUNTO = {
  nombre: "Conjunto Parque Residencial Calle Cien",
  slug: "parque-residencial-calle-cien",
  unidades: 350,
  ciudad: "Bogotá",
  direccion: "Calle 100 # 49-97",
};

// 350 unidades cae en el tramo 201-400. Se lee de la base para no fijar aqui un
// precio que despues quede desincronizado con las reglas reales.
const PRECIO_FALLBACK_CENTS = 199_000 * 100;

function demoPassword() {
  const password = process.env.CALLE_100_DEMO_PASSWORD?.trim();
  if (!password) throw new Error("Falta CALLE_100_DEMO_PASSWORD para reconstruir la demo.");
  return password;
}

function assertDedicatedDemoDatabase() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const declaredDemoUrl = process.env.DEMO_DATABASE_URL?.trim();
  if (!databaseUrl || !declaredDemoUrl || databaseUrl !== declaredDemoUrl) {
    throw new Error("Abortado: DATABASE_URL debe coincidir exactamente con DEMO_DATABASE_URL.");
  }
  if (process.env.DEMO_DATABASE_MODE !== "calle-100") {
    throw new Error("Abortado: requiere DEMO_DATABASE_MODE=calle-100.");
  }
}

const RESIDENTES = [
  ["María Fernanda Ríos", "mfrios", 1, 101],
  ["Carlos Andrés Pineda", "capineda", 1, 204],
  ["Luz Marina Ochoa", "lmochoa", 2, 302],
  ["Jorge Enrique Vallejo", "jevallejo", 2, 405],
  ["Diana Carolina Mejía", "dcmejia", 3, 108],
  ["Andrés Felipe Cardona", "afcardona", 3, 210],
  ["Claudia Patricia Salazar", "cpsalazar", 4, 303],
  ["Ricardo Alberto Nieto", "ranieto", 4, 401],
  ["Sandra Milena Guzmán", "smguzman", 5, 106],
  ["Óscar Iván Betancur", "oibetancur", 5, 207],
  ["Paula Andrea Restrepo", "parestrepo", 6, 309],
  ["Julián Esteban Muñoz", "jemunoz", 6, 402],
  ["Gloria Esperanza Cifuentes", "gecifuentes", 7, 105],
  ["Hernán Darío Zapata", "hdzapata", 7, 208],
  ["Natalia Andrea Quintero", "naquintero", 7, 310],
] as const;

// Casos reales de un conjunto residencial. El titulo es lo primero que ve una
// administradora en la lista: si todos dicen "Solicitud", la demo no convence.
const CASOS: Array<[string, string, string]> = [
  ["Fuga de agua en el sifón del parqueadero 42", "MANTENIMIENTO", "Hay agua estancada desde el fin de semana y sale olor. El carro queda sobre el charco."],
  ["Bombillo fundido en la escalera del bloque 3", "ZONAS_COMUNES", "Lleva cuatro días sin luz. De noche no se ve el último tramo y es peligroso."],
  ["Ruido de obra fuera del horario permitido", "CONVIVENCIA", "En el 405 están perforando después de las 9 de la noche."],
  ["Portón vehicular no cierra completamente", "SEGURIDAD_VIGILANCIA", "Queda una luz de 20 cm. Cualquiera puede meter la mano y abrir por dentro."],
  ["No me ha llegado el paquete que dejaron en portería", "ACCESOS_CORRESPONDENCIA", "El domiciliario dice que lo entregó el martes y en portería no aparece."],
  ["Cobro doble en la administración de julio", "CARTERA_PAGOS", "Me descontaron dos veces el mismo mes de la cuenta."],
  ["Solicito certificado de paz y salvo", "ADMINISTRACION_CERTIFICADOS", "Lo necesito para un trámite bancario esta semana."],
  ["Filtración en el techo del apartamento 302", "MANTENIMIENTO", "Cuando llueve fuerte cae agua sobre la sala. Ya se manchó el cielo raso."],
  ["Mascota sin correa en el parque infantil", "CONVIVENCIA", "Un perro grande suelto donde juegan los niños."],
  ["Ascensor del bloque 2 se detiene entre pisos", "MANTENIMIENTO", "Se quedó parado dos veces esta semana con gente adentro."],
  ["Reflectores del parqueadero apagados", "ZONAS_COMUNES", "Toda la zona sur quedó a oscuras."],
  ["Cámara del acceso peatonal desenfocada", "SEGURIDAD_VIGILANCIA", "La imagen se ve borrosa y no se distinguen las caras."],
  ["Fuga en la llave del salón comunal", "ZONAS_COMUNES", "Gotea permanente, se está desperdiciando agua."],
  ["Solicito paz y salvo para venta del inmueble", "ADMINISTRACION_CERTIFICADOS", "Estoy en proceso de escrituración."],
  ["Vecino del 208 deja basura en el pasillo", "CONVIVENCIA", "Las bolsas quedan afuera toda la noche y atraen insectos."],
  ["Grieta en la pared del parqueadero cubierto", "MANTENIMIENTO", "Va desde el piso hasta media pared y parece haber crecido."],
  ["Citófono del 106 no timbra", "ACCESOS_CORRESPONDENCIA", "Los domiciliarios no logran avisar cuando llegan."],
  ["Reposición de arena en el parque infantil", "ZONAS_COMUNES", "Quedó muy poca y los niños llegan al piso duro."],
  ["Ajuste en la cuota de administración", "CARTERA_PAGOS", "Quiero entender por qué subió este trimestre."],
  ["Motobomba con ruido anormal", "MANTENIMIENTO", "Suena distinto desde el lunes, como golpeteo."],
  ["Puerta del cuarto de basuras sin cerradura", "SEGURIDAD_VIGILANCIA", "Queda abierta y entran gatos."],
  ["Humedad en el muro medianero del 309", "MANTENIMIENTO", "La pintura se está abombando."],
  ["Solicitud de reserva del salón comunal", "ADMINISTRACION_CERTIFICADOS", "Para un cumpleaños familiar el próximo sábado."],
  ["Carro mal parqueado bloquea la salida", "CONVIVENCIA", "Una camioneta lleva dos días atravesada en la rampa."],
  ["Luminaria del bloque 5 titila", "ZONAS_COMUNES", "Prende y apaga toda la noche."],
  ["No recibí el recibo de administración", "CARTERA_PAGOS", "No llegó ni físico ni al correo."],
  ["Rejilla suelta en el andén de entrada", "MANTENIMIENTO", "Se levanta al pisarla, alguien se va a caer."],
  ["Vigilante nuevo no pide identificación", "SEGURIDAD_VIGILANCIA", "Dejó entrar a un desconocido sin registrarlo."],
  ["Fuga en el tanque de reserva", "MANTENIMIENTO", "Se ve agua corriendo por la placa del sótano."],
  ["Correspondencia entregada al apartamento equivocado", "ACCESOS_CORRESPONDENCIA", "Me llegó un sobre del 401 y el mío no aparece."],
  ["Solicito certificación de convivencia", "ADMINISTRACION_CERTIFICADOS", "Requisito para un trámite laboral."],
  ["Gimnasio con caminadora dañada", "ZONAS_COMUNES", "La banda se detiene sola a mitad de uso."],
  ["Olores fuertes en el shut de basuras", "MANTENIMIENTO", "Especialmente en el bloque 4, piso 3."],
  ["Discusión entre vecinos en el parqueadero", "CONVIVENCIA", "Ocurre seguido por el uso de una celda."],
  ["Sensor de la puerta principal no detecta", "ACCESOS_CORRESPONDENCIA", "Hay que empujarla a mano."],
  ["Pintura descascarada en la fachada norte", "MANTENIMIENTO", "Se ve desde la calle y da mala imagen."],
  ["Cobro de intereses que no reconozco", "CARTERA_PAGOS", "Pagué a tiempo y aun así aparecen."],
  ["Poda de árboles del antejardín", "ZONAS_COMUNES", "Las ramas ya tocan las ventanas del primer piso."],
  ["Extintor vencido en el bloque 6", "SEGURIDAD_VIGILANCIA", "La etiqueta dice que venció hace tres meses."],
  ["Gotera sobre el ascensor del bloque 1", "MANTENIMIENTO", "Cae agua justo encima de la puerta."],
  ["Solicito copia del reglamento de propiedad horizontal", "ADMINISTRACION_CERTIFICADOS", "Para revisar el tema de mascotas."],
  ["Bicicletero sin espacio disponible", "ZONAS_COMUNES", "Hay bicicletas abandonadas ocupando puestos."],
  ["Ruido de mascota durante la madrugada", "CONVIVENCIA", "Un perro ladra desde las 2 a. m."],
  ["Tapa de alcantarilla suelta en la vía interna", "MANTENIMIENTO", "Suena y se mueve cuando pasan los carros."],
  ["Talanquera se levanta sola", "SEGURIDAD_VIGILANCIA", "Se abre sin que nadie la accione."],
  ["Solicitud de estado de cuenta detallado", "CARTERA_PAGOS", "Quiero ver el desglose de los últimos seis meses."],
  ["Filtro de la piscina requiere cambio", "MANTENIMIENTO", "El agua se ve turbia desde hace una semana."],
  ["Puerta de emergencia bloqueada con cajas", "SEGURIDAD_VIGILANCIA", "No se puede abrir en caso de evacuación."],
  ["Timbre del portón peatonal sin sonido", "ACCESOS_CORRESPONDENCIA", "Toca llamar por celular para que abran."],
  ["Manchas de humedad en el parqueadero visitantes", "MANTENIMIENTO", "El techo gotea sobre dos celdas."],
];

const RESPUESTAS_CIERRE = [
  "Se atendió con el personal de mantenimiento y quedó resuelto. Se adjunta registro fotográfico.",
  "Se coordinó con el proveedor externo, ejecutó la reparación y se verificó en sitio.",
  "Se realizó la reposición del elemento y se verificó su funcionamiento con el residente.",
  "Se habló con las partes involucradas y se llegó a un acuerdo. Quedó constancia en el acta.",
  "Se expidió el documento solicitado y se entregó al residente por correo.",
  "Se corrigió el registro en cartera y se notificó el ajuste al residente.",
];

const NOTAS_PRIMER_CONTACTO = [
  "Se recibió la solicitud y se programó visita de verificación.",
  "Se contactó al residente para confirmar los detalles del caso.",
  "Se revisó en sitio y se solicitó cotización al proveedor.",
  "Se escaló al personal de mantenimiento del conjunto.",
];

function dias(base: Date, n: number) {
  return new Date(base.getTime() + n * 24 * 60 * 60 * 1000);
}
function pick<T>(arr: readonly T[], i: number): T {
  return arr[i % arr.length];
}
function mesEtiqueta(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

async function borrarDemoExistente() {
  const existente = await prisma.tenant.findUnique({
    where: { slug: CONJUNTO.slug },
    select: { id: true, name: true, subscription: { select: { id: true } } },
  });
  if (!existente) return;

  const usuarios = await prisma.user.findMany({
    where: {
      OR: [
        { tenantId: existente.id },
        { memberships: { some: { tenantId: existente.id } } },
      ],
    },
    select: { id: true, email: true },
  });
  const userIds = usuarios.map((usuario) => usuario.id);
  const compartido = userIds.length
    ? await prisma.user.findFirst({
      where: { id: { in: userIds }, memberships: { some: { tenantId: { not: existente.id } } } },
      select: { email: true },
    })
    : null;
  if (compartido) {
    throw new Error(`Abortado: ${compartido.email} tambien pertenece a otro conjunto y no se puede reutilizar como cuenta demo.`);
  }

  await prisma.$transaction(async (tx) => {
    // Orden de hijos a padres. Todo filtro queda atado al tenant demo: un
    // refresco nunca debe tocar otro conjunto, ni siquiera en la misma base.
    await tx.billingOutboxAttempt.deleteMany({ where: { outbox: { tenantId: existente.id } } });
    await tx.emailLog.deleteMany({ where: { tenantId: existente.id } });
    await tx.billingNotificationOutbox.deleteMany({ where: { tenantId: existente.id } });
    await tx.pqrsFoto.deleteMany({ where: { tenantId: existente.id } });
    await tx.historialPqrs.deleteMany({ where: { tenantId: existente.id } });
    await tx.pqrsCorrection.deleteMany({ where: { tenantId: existente.id } });
    await tx.pqrs.deleteMany({ where: { tenantId: existente.id } });
    await tx.pqrsCategory.deleteMany({ where: { tenantId: existente.id } });
    await tx.paymentReceipt.deleteMany({ where: { tenantId: existente.id } });
    await tx.residentPayment.deleteMany({ where: { tenantId: existente.id } });
    await tx.residentCharge.deleteMany({ where: { tenantId: existente.id } });
    await tx.paymentImportBatch.deleteMany({ where: { tenantId: existente.id } });
    await tx.residentUnit.deleteMany({ where: { tenantId: existente.id } });
    await tx.commonAreaBlock.deleteMany({ where: { tenantId: existente.id } });
    await tx.reservation.deleteMany({ where: { tenantId: existente.id } });
    await tx.commonArea.deleteMany({ where: { tenantId: existente.id } });
    await tx.payment.deleteMany({ where: { tenantId: existente.id } });
    await tx.wompiPaymentMethod.deleteMany({ where: { tenantId: existente.id } });
    await tx.commercialOperation.deleteMany({ where: { tenantId: existente.id } });
    await tx.tenantFeatureEntitlement.deleteMany({ where: { tenantId: existente.id } });
    await tx.tenantCommercialProfile.deleteMany({ where: { tenantId: existente.id } });
    await tx.subscription.deleteMany({ where: { tenantId: existente.id } });
    await tx.webhookEvent.deleteMany({
      where: {
        OR: [
          { tenantId: existente.id },
          ...(existente.subscription ? [{ subscriptionId: existente.subscription.id }] : []),
        ],
      },
    });
    await tx.invitation.deleteMany({ where: { tenantId: existente.id } });
    await tx.notification.deleteMany({ where: { tenantId: existente.id } });
    await tx.supportTicket.deleteMany({ where: { tenantId: existente.id } });
    await tx.auditLog.deleteMany({ where: { tenantId: existente.id } });
    await tx.tenantMembership.deleteMany({ where: { tenantId: existente.id } });
    await tx.user.updateMany({ where: { tenantId: existente.id }, data: { tenantId: null } });
    await tx.tenant.delete({ where: { id: existente.id } });

    if (userIds.length) {
      await tx.user.deleteMany({
        where: { id: { in: userIds }, tenantId: null, memberships: { none: {} }, role: { not: Role.SUPER_ADMIN } },
      });
    }
  });

  console.log(`   Demo anterior eliminado: ${existente.name}`);
}

async function main() {
  assertDedicatedDemoDatabase();
  if (process.env.CONFIRM_DEMO_RESET !== "CALLE_100_DEMO") {
    throw new Error("Abortado: requiere CONFIRM_DEMO_RESET=CALLE_100_DEMO.");
  }

  console.log("\n1) Reiniciando solo Calle 100...");
  await borrarDemoExistente();

  console.log("\n2) Creando el conjunto...");
  const regla = await prisma.pricingRule.findFirst({
    where: { type: "MONTHLY", isActive: true, minUnits: { lte: CONJUNTO.unidades } },
    orderBy: { minUnits: "desc" },
  });
  const precioCents = regla?.priceCents ?? PRECIO_FALLBACK_CENTS;

  const tenant = await prisma.tenant.create({
    data: {
      name: CONJUNTO.nombre,
      slug: CONJUNTO.slug,
      units: CONJUNTO.unidades,
      city: CONJUNTO.ciudad,
      address: CONJUNTO.direccion,
      status: "ACTIVE",
    },
  });
  console.log(`   ${tenant.name} · ${tenant.units} unidades · ${(precioCents / 100).toLocaleString("es-CO")} COP/mes`);

  const { INITIAL_PQRS_CATEGORIES } = await import("../src/domains/pqrs/pqrs-category-policy");
  await prisma.pqrsCategory.createMany({
    data: INITIAL_PQRS_CATEGORIES.map((c) => ({
      tenantId: tenant.id,
      canonicalKey: c.canonicalKey,
      slug: c.slug,
      displayName: c.displayName,
      sortOrder: c.sortOrder,
      workflowType: c.workflowType,
    })),
  });
  const categorias = await prisma.pqrsCategory.findMany({ where: { tenantId: tenant.id } });
  const porClave = new Map(categorias.map((c) => [c.canonicalKey as string, c]));
  console.log(`   ${categorias.length} categorías`);

  console.log("\n3) Creando usuarios...");
  const hash = await bcrypt.hash(demoPassword(), 10);
  const ahora = new Date();

  const admin = await prisma.user.create({
    data: {
      email: "administracion@parquecalle100.com",
      name: "Marcela Ospina",
      password: hash,
      role: Role.ADMIN,
      isActive: true,
      onboardingCompletedAt: dias(ahora, -200),
      termsAcceptedAt: dias(ahora, -200),
    },
  });
  await prisma.tenantMembership.create({
    data: { userId: admin.id, tenantId: tenant.id, role: Role.ADMIN, isActive: true, onboardingCompletedAt: dias(ahora, -200) },
  });

  const consejo = await prisma.user.create({
    data: {
      email: "consejo@parquecalle100.com",
      name: "Fernando Arboleda",
      password: hash,
      role: Role.CONSEJO,
      isActive: true,
      onboardingCompletedAt: dias(ahora, -195),
      termsAcceptedAt: dias(ahora, -195),
    },
  });
  await prisma.tenantMembership.create({
    data: { userId: consejo.id, tenantId: tenant.id, role: Role.CONSEJO, isActive: true, onboardingCompletedAt: dias(ahora, -195) },
  });

  const residentes: { id: string; name: string; bloque: number; apto: number }[] = [];
  for (const [nombre, usuario, bloque, apto] of RESIDENTES) {
    const u = await prisma.user.create({
      data: {
        email: `${usuario}@parquecalle100.com`,
        name: nombre,
        password: hash,
        role: Role.RESIDENTE,
        isActive: true,
        onboardingCompletedAt: dias(ahora, -180),
        termsAcceptedAt: dias(ahora, -180),
      },
    });
    await prisma.tenantMembership.create({
      data: { userId: u.id, tenantId: tenant.id, role: Role.RESIDENTE, isActive: true, bloque, apto, onboardingCompletedAt: dias(ahora, -180) },
    });
    residentes.push({ id: u.id, name: nombre, bloque, apto });
  }
  console.log(`   1 administradora, 1 consejo, ${residentes.length} residentes`);

  console.log("\n4) Creando PQRS...");
  let cerradas = 0, enProceso = 0, enEspera = 0;

  for (let i = 0; i < CASOS.length; i += 1) {
    const [titulo, claveCat, descripcion] = CASOS[i];
    const cat = porClave.get(claveCat)!;
    const res = pick(residentes, i);

    // Repartidas en 6 meses, mas densas hacia el presente: un conjunto que
    // empieza a usar la plataforma radica poco al principio y mas despues.
    const antiguedad = Math.round(175 * Math.pow(1 - i / CASOS.length, 1.6)) + 1;
    const recibido = dias(ahora, -antiguedad);

    // 70 % cerradas, 20 % en proceso, 10 % en espera. Un conjunto con todo
    // cerrado no es creible; uno con todo abierto no vende.
    const r = i % 10;
    const estado = r < 7 ? Estado.TERMINADO : r < 9 ? Estado.EN_PROGRESO : Estado.EN_ESPERA;

    const horasContacto = 2 + (i % 20);
    const primerContacto = estado === Estado.EN_ESPERA ? null : new Date(recibido.getTime() + horasContacto * 3600_000);
    const diasCierre = 1 + (i % 9);
    const cierre = estado === Estado.TERMINADO ? dias(recibido, diasCierre) : null;

    const pqrs = await prisma.pqrs.create({
      data: {
        tenantId: tenant.id,
        fechaRecibido: recibido,
        mes: mesEtiqueta(recibido),
        bloque: res.bloque,
        apto: res.apto,
        nombreResidente: res.name,
        titulo,
        descripcion,
        categoryId: cat.id,
        categorySnapshot: cat.displayName,
        asunto: cat.displayName,
        workflowType: cat.workflowType,
        prioridad: i % 7 === 0 ? Prioridad.ALTA : i % 3 === 0 ? Prioridad.BAJA : Prioridad.MEDIA,
        estado,
        creadoPorId: res.id,
        gestionadoPorId: estado === Estado.EN_ESPERA ? null : admin.id,
        numeroRadicacion: `PQRS-${mesEtiqueta(recibido).replace("-", "")}-${String(i + 1).padStart(4, "0")}`,
        fechaPrimerContacto: primerContacto,
        tiempoRespuestaPrimerContacto: primerContacto ? horasContacto : null,
        notaPrimerContacto: primerContacto ? pick(NOTAS_PRIMER_CONTACTO, i) : null,
        accionTomada: cierre ? pick(RESPUESTAS_CIERRE, i) : null,
        evidenciaCierre: cierre ? "Registro fotográfico y firma de conformidad del residente." : null,
        fechaCierre: cierre,
        tiempoRespuestaCierre: cierre ? diasCierre : null,
        faseActual: cat.workflowType === "MAINTENANCE" ? (estado === Estado.TERMINADO ? 5 : estado === Estado.EN_PROGRESO ? 2 + (i % 3) : null) : null,
        createdAt: recibido,
      },
    });

    const historial: { tenantId: string; pqrsId: string; estadoAntes: Estado | null; estadoDespues: Estado; nota: string; creadoAt: Date }[] = [
      { tenantId: tenant.id, pqrsId: pqrs.id, estadoAntes: null, estadoDespues: Estado.EN_ESPERA, nota: "Solicitud radicada por el residente.", creadoAt: recibido },
    ];
    if (primerContacto) {
      historial.push({ tenantId: tenant.id, pqrsId: pqrs.id, estadoAntes: Estado.EN_ESPERA, estadoDespues: Estado.EN_PROGRESO, nota: pick(NOTAS_PRIMER_CONTACTO, i), creadoAt: primerContacto });
    }
    if (cierre) {
      historial.push({ tenantId: tenant.id, pqrsId: pqrs.id, estadoAntes: Estado.EN_PROGRESO, estadoDespues: Estado.TERMINADO, nota: pick(RESPUESTAS_CIERRE, i), creadoAt: cierre });
    }
    await prisma.historialPqrs.createMany({ data: historial });

    if (estado === Estado.TERMINADO) cerradas += 1;
    else if (estado === Estado.EN_PROGRESO) enProceso += 1;
    else enEspera += 1;
  }
  console.log(`   ${CASOS.length} PQRS · ${cerradas} cerradas, ${enProceso} en proceso, ${enEspera} en espera`);

  console.log("\n5) Creando licencia e historial de pagos...");
  const inicioPeriodo = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
  const finPeriodo = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 1);

  const sub = await prisma.subscription.create({
    data: {
      tenantId: tenant.id,
      status: "ACTIVE",
      autoRenew: true,
      unitsSnapshot: CONJUNTO.unidades,
      priceCents: precioCents,
      currency: "COP",
      currentPeriodStart: inicioPeriodo,
      currentPeriodEnd: finPeriodo,
    },
  });

  // Cinco meses de historial: el primero por transferencia (como suele empezar
  // un conjunto) y los cuatro siguientes por la pasarela, que es la senal de que
  // el cobro automatico quedo funcionando.
  for (let k = 4; k >= 0; k -= 1) {
    const ini = new Date(ahora.getFullYear(), ahora.getMonth() - k, 1);
    const fin = new Date(ahora.getFullYear(), ahora.getMonth() - k + 1, 1);
    const pagado = new Date(ini.getFullYear(), ini.getMonth(), 3, 10, 30);
    const esPrimero = k === 4;
    await prisma.payment.create({
      data: {
        tenantId: tenant.id,
        subscriptionId: sub.id,
        amountCents: precioCents,
        listAmountCents: precioCents,
        concept: "SUBSCRIPTION_MONTHLY",
        currency: "COP",
        status: "APPROVED",
        provider: esPrimero ? "MANUAL_TRANSFER" : "WOMPI",
        dueDate: ini,
        paidAt: pagado,
        periodStart: ini,
        periodEnd: fin,
        approvedEffectAppliedAt: pagado,
        ...(esPrimero ? { manualReference: "Transferencia Bancolombia 8842190" } : {}),
      },
    });
  }
  console.log(`   5 pagos de ${(precioCents / 100).toLocaleString("es-CO")} COP: 1 transferencia + 4 Wompi`);

  console.log("\nListo.");
  console.log(`   Administradora: administracion@parquecalle100.com`);
  console.log(`   Consejo:        consejo@parquecalle100.com`);
  console.log(`   Residentes:     mfrios@parquecalle100.com ... (15)`);
  console.log("   Credenciales de demo creadas sin mostrarlas en consola.");
}

main()
  .catch((e) => {
    console.error("FALLO:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
