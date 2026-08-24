export type PqrsWorkflowType = "SIMPLE" | "MAINTENANCE";

const MAINTENANCE_PHASE_LABELS: Record<number, string> = {
  1: "Inspección de campo",
  2: "Adquisición de insumos",
  3: "Firma de contrato con proveedor",
  4: "Ejecución",
  5: "Terminado",
};

export function pqrsPhaseDisplayLabel(
  workflowType: PqrsWorkflowType | null | undefined,
  phase: number
): string {
  if (workflowType === "SIMPLE") {
    if (phase === 1) return "En gestión";
    if (phase === 5) return "Gestión completada";
    return "Sin gestión registrada";
  }

  return `Fase ${phase} - ${MAINTENANCE_PHASE_LABELS[phase] || "Sin definir"}`;
}