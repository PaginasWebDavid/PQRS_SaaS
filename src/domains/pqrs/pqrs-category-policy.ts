import type { PqrsWorkflowType } from "@prisma/client";

export const MAX_CUSTOM_PQRS_CATEGORIES = 3;

export const INITIAL_PQRS_CATEGORIES: ReadonlyArray<{
  canonicalKey: string;
  slug: string;
  displayName: string;
  sortOrder: number;
  workflowType: PqrsWorkflowType;
}> = [
  { canonicalKey: "CONVIVENCIA", slug: "convivencia", displayName: "Convivencia", sortOrder: 10, workflowType: "SIMPLE" },
  { canonicalKey: "SEGURIDAD_VIGILANCIA", slug: "seguridad-vigilancia", displayName: "Seguridad y vigilancia", sortOrder: 20, workflowType: "SIMPLE" },
  { canonicalKey: "ACCESOS_CORRESPONDENCIA", slug: "accesos-correspondencia", displayName: "Accesos y correspondencia", sortOrder: 30, workflowType: "SIMPLE" },
  { canonicalKey: "MANTENIMIENTO", slug: "mantenimiento", displayName: "Mantenimiento", sortOrder: 40, workflowType: "MAINTENANCE" },
  { canonicalKey: "ZONAS_COMUNES", slug: "zonas-comunes", displayName: "Zonas comunes", sortOrder: 50, workflowType: "MAINTENANCE" },
  { canonicalKey: "CARTERA_PAGOS", slug: "cartera-pagos", displayName: "Cartera y pagos", sortOrder: 60, workflowType: "SIMPLE" },
  { canonicalKey: "ADMINISTRACION_CERTIFICADOS", slug: "administracion-certificados", displayName: "Administracion y certificados", sortOrder: 70, workflowType: "SIMPLE" },
  { canonicalKey: "OTROS", slug: "otros", displayName: "Otros", sortOrder: 80, workflowType: "SIMPLE" },
];

export const LEGACY_CATEGORY_CANONICAL_KEY: Readonly<Record<string, string>> = {
  CONVIVENCIA: "CONVIVENCIA",
  CONTABILIDAD: "CARTERA_PAGOS",
  "AREA COMUN": "ZONAS_COMUNES",
  "AREA PRIVADA": "MANTENIMIENTO",
  "HUMEDAD/CUBIERTA": "MANTENIMIENTO",
  "HUMEDAD/DEPOSITO": "MANTENIMIENTO",
  "HUMEDAD/VENTANAS": "MANTENIMIENTO",
  "HUMEDAD/FACHADA": "MANTENIMIENTO",
  "HUMEDAD/GARAJE": "MANTENIMIENTO",
};

export const LEGACY_CATEGORY_LABELS: Readonly<Record<string, string>> = {
  "AREA COMUN": "Area comun",
  "AREA PRIVADA": "Area privada",
  CONTABILIDAD: "Contabilidad",
  CONVIVENCIA: "Convivencia",
  "HUMEDAD/CUBIERTA": "Humedad - Cubierta",
  "HUMEDAD/DEPOSITO": "Humedad - Deposito",
  "HUMEDAD/VENTANAS": "Humedad - Ventanas",
  "HUMEDAD/FACHADA": "Humedad - Fachada",
  "HUMEDAD/GARAJE": "Humedad - Garaje",
};

export function isPqrsWorkflowType(value: unknown): value is PqrsWorkflowType {
  return value === "SIMPLE" || value === "MAINTENANCE";
}

export function normalizeCategoryDisplayName(value: unknown): string {
  if (typeof value !== "string") throw new Error("Nombre de categoria invalido");
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length < 2 || normalized.length > 80 || /[\u0000-\u001F\u007F]/.test(normalized)) {
    throw new Error("Nombre de categoria invalido");
  }
  return normalized;
}

export function categorySlugBase(displayName: string): string {
  const slug = displayName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  if (slug.length < 2) throw new Error("Nombre de categoria invalido");
  return slug;
}

export function normalizeCategorySortOrder(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 999) {
    throw new Error("Orden de categoria invalido");
  }
  return parsed;
}

export function pqrsCategoryVisibleLabel(input: {
  categorySnapshot?: string | null;
  asunto?: string | null;
}): string {
  if (input.categorySnapshot?.trim()) return input.categorySnapshot.trim();
  if (!input.asunto) return "Sin categoria";
  return LEGACY_CATEGORY_LABELS[input.asunto] || input.asunto;
}