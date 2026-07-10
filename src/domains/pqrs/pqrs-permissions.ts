import { Prisma, Role } from "@prisma/client";

type TakenPqrs = {
  estado: "EN_ESPERA" | "EN_PROGRESO" | "TERMINADO";
  fechaPrimerContacto: Date | null;
  gestionadoPorId: string | null;
  numeroRadicacion: string | null;
};

export function isPqrsTakenByAdministration(pqrs: TakenPqrs) {
  return pqrs.estado !== "EN_ESPERA" || Boolean(pqrs.fechaPrimerContacto) || Boolean(pqrs.gestionadoPorId) || Boolean(pqrs.numeroRadicacion);
}

export function pqrsScopeForUser({ tenantId, userId, role }: { tenantId: string; userId: string; role: Role }): Prisma.PqrsWhereInput {
  if (role === "SUPER_ADMIN") throw new Error("SUPER_ADMIN no opera PQRS de conjuntos");
  return role === "RESIDENTE" ? { tenantId, creadoPorId: userId } : { tenantId };
}

export function canResidentAccessPqrs({ ownerId, userId }: { ownerId: string | null; userId: string }) {
  return Boolean(ownerId) && ownerId === userId;
}
