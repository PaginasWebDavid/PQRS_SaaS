export type PqrsWorkflowType = "SIMPLE" | "MAINTENANCE";

const MAINTENANCE_PHASE_LABELS: Record<number, string> = {
  1: "Inspeccion de campo",
  2: "Adquisicion de insumos",
  3: "Firma de contrato con proveedor",
  4: "Ejecucion",
  5: "Terminado",
};

export function pqrsPhaseDisplayLabel(
  workflowType: PqrsWorkflowType | null | undefined,
  phase: number
): string {
  if (workflowType === "SIMPLE") {
    if (phase === 1) return "En gestion";
    if (phase === 5) return "Gestion completada";
    return "Fase no aplicable";
  }

  return `Fase ${phase} - ${MAINTENANCE_PHASE_LABELS[phase] || "Sin definir"}`;
}