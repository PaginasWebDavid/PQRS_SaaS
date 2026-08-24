import { prisma } from "@/lib/prisma";

// Limite de intentos por ventana deslizante, respaldado por Postgres.
//
// POR QUE NO EN MEMORIA
//
// En Vercel cada invocacion puede caer en una instancia distinta y las
// instancias se reciclan solas. Un Map en memoria daria una sensacion de
// proteccion y dejaria pasar casi todo el trafico de un ataque real. El
// contador tiene que ser compartido, y la base de datos ya lo es.
//
// POR QUE NO FALLA CERRADO
//
// Si la consulta falla, se permite el intento. Puede sonar al reves, pero el
// login ya necesita la base para buscar al usuario y comparar la contrasena:
// si Postgres no responde, no hay inicio de sesion posible de todos modos.
// Bloquear ademas por un fallo del limitador solo convertiria una caida de
// base en una caida mas confusa de diagnosticar.

export type ResultadoLimite = {
  permitido: boolean;
  /** Segundos que faltan para que se libere el bucket. Cero si esta permitido. */
  esperaSegundos: number;
};

const PERMITIDO: ResultadoLimite = { permitido: true, esperaSegundos: 0 };

/**
 * Cuenta los intentos recientes del bucket y, si aun hay cupo, registra este.
 * Las filas vencidas del mismo bucket se borran en la misma llamada, asi que
 * la tabla no crece sin limite y no hace falta un proceso de limpieza aparte.
 */
export async function registrarIntento(
  bucket: string,
  maximo: number,
  ventanaSegundos: number
): Promise<ResultadoLimite> {
  const desde = new Date(Date.now() - ventanaSegundos * 1000);

  try {
    // Se borra primero: un intento que ya salio de la ventana no debe contar
    // ni ocupar espacio.
    await prisma.rateLimitHit.deleteMany({
      where: { bucket, createdAt: { lt: desde } },
    });

    const recientes = await prisma.rateLimitHit.findMany({
      where: { bucket, createdAt: { gte: desde } },
      orderBy: { createdAt: "asc" },
      take: maximo,
      select: { createdAt: true },
    });

    if (recientes.length >= maximo) {
      // El bucket se libera cuando el intento MAS ANTIGUO de la ventana sale
      // de ella, no cuando pasa la ventana completa desde ahora.
      const libera = recientes[0].createdAt.getTime() + ventanaSegundos * 1000;
      return {
        permitido: false,
        esperaSegundos: Math.max(1, Math.ceil((libera - Date.now()) / 1000)),
      };
    }

    await prisma.rateLimitHit.create({ data: { bucket } });
    return PERMITIDO;
  } catch {
    return PERMITIDO;
  }
}

/**
 * Borra los intentos de un bucket. Se llama cuando alguien entra bien: haber
 * fallado tres veces y acertar a la cuarta no debe dejar el contador cargado
 * contra esa persona.
 */
export async function limpiarIntentos(bucket: string): Promise<void> {
  try {
    await prisma.rateLimitHit.deleteMany({ where: { bucket } });
  } catch {
    // Que no se limpie el contador no puede impedir un inicio de sesion valido.
  }
}

/**
 * En Vercel la IP del cliente llega en la cabecera, no en el socket. El primer
 * valor de x-forwarded-for es el cliente; el resto son los proxies.
 */
export function ipDeCabeceras(headers: Headers): string {
  const reenviada = headers.get("x-forwarded-for");
  if (reenviada) {
    const primera = reenviada.split(",")[0]?.trim();
    if (primera) return primera;
  }
  return headers.get("x-real-ip")?.trim() || "desconocida";
}

// Politicas. Se declaran juntas para que se puedan leer de un vistazo y no
// queden numeros sueltos repartidos por las rutas.
export const LIMITES = {
  // Fuerza bruta contra UNA cuenta concreta.
  loginPorCorreo: { maximo: 5, ventanaSegundos: 15 * 60 },
  // Barrido de muchas cuentas desde una misma IP. Mas holgado que el anterior
  // porque una administradora y sus residentes pueden compartir la salida a
  // internet del conjunto.
  loginPorIp: { maximo: 20, ventanaSegundos: 15 * 60 },
  // Cada intento gasta un correo de Resend: tiene costo y puede usarse para
  // inundar el buzon de un tercero.
  correoPorDestinatario: { maximo: 3, ventanaSegundos: 60 * 60 },
  correoPorIp: { maximo: 10, ventanaSegundos: 60 * 60 },
} as const;
