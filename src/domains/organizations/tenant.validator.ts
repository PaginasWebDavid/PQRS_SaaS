export function assertTenantId(tenantId: string | null | undefined): string {
  if (!tenantId) {
    throw new Error("No se pudo resolver el tenant del usuario autenticado");
  }

  return tenantId;
}