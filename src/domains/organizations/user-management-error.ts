// Mapper puro de errores de gestion de usuarios a respuesta HTTP.
//
// Regla de seguridad: SOLO los mensajes de dominio conocidos (lista exacta) se
// exponen al cliente con su status. Cualquier otro error (Prisma, conectividad,
// infraestructura, bug inesperado) se colapsa a un 500 con mensaje generico,
// para no filtrar constraints, SQL, rutas internas, stack ni conexion.
//
// Se usa coincidencia EXACTA (no substring/prefijo) para que un mensaje de
// Prisma que contenga por casualidad texto de dominio nunca se convierta en
// respuesta publica.

export const GENERIC_USER_MANAGEMENT_ERROR = "No se pudo procesar la solicitud";

// Mensajes de dominio lanzados por `updateManagedUser` y su status permitido.
// "Usuario no encontrado" cubre, de forma indistinguible: id inexistente,
// recurso de otro tenant y SUPER_ADMIN no administrable desde un tenant.
const KNOWN_USER_MANAGEMENT_ERRORS = new Map<string, number>([
  ["Usuario no encontrado", 404],
  ["Rol invalido", 400],
  ["Bloque invalido", 400],
  ["Apartamento invalido", 400],
  ["No puedes cambiar tu propio rol ni desactivar tu cuenta", 400],
  ["El conjunto debe conservar al menos un administrador activo", 400],
]);

export interface UserManagementErrorResponse {
  status: number;
  message: string;
}

export function mapUserManagementError(error: unknown): UserManagementErrorResponse {
  if (error instanceof Error) {
    const status = KNOWN_USER_MANAGEMENT_ERRORS.get(error.message);
    if (status !== undefined) {
      return { status, message: error.message };
    }
  }
  return { status: 500, message: GENERIC_USER_MANAGEMENT_ERROR };
}
