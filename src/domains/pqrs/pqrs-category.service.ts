import { AuditAction, Prisma, type Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  categorySlugBase,
  INITIAL_PQRS_CATEGORIES,
  isPqrsWorkflowType,
  LEGACY_CATEGORY_CANONICAL_KEY,
  MAX_CUSTOM_PQRS_CATEGORIES,
  normalizeCategoryDisplayName,
  normalizeCategorySortOrder,
} from "./pqrs-category-policy";

export class PqrsCategoryError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "FORBIDDEN" | "INVALID" | "LIMIT_REACHED" | "NO_CHANGES" | "CONFLICT",
    message: string
  ) {
    super(message);
    this.name = "PqrsCategoryError";
  }
}

function requireAdmin(role: Role) {
  if (role !== "ADMIN") throw new PqrsCategoryError("FORBIDDEN", "No tiene permisos");
}

function initialCategoryData(tenantId: string, createdByUserId?: string | null) {
  return INITIAL_PQRS_CATEGORIES.map((category) => ({
    tenantId,
    ...category,
    isActive: true,
    isCustom: false,
    createdByUserId: createdByUserId || null,
  }));
}

export async function ensureInitialPqrsCategoriesForTenant(
  tenantId: string,
  createdByUserId?: string | null
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'pqrs-categories:' + tenantId}, 0))`;
    const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
    if (!tenant) throw new PqrsCategoryError("NOT_FOUND", "Conjunto no encontrado");
    await tx.pqrsCategory.createMany({ data: initialCategoryData(tenantId, createdByUserId), skipDuplicates: true });
    return tx.pqrsCategory.findMany({ where: { tenantId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  });
}

export async function listPqrsCategoriesForCreation(tenantId: string) {
  await ensureInitialPqrsCategoriesForTenant(tenantId);
  return prisma.pqrsCategory.findMany({
    where: { tenantId, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, slug: true, displayName: true, workflowType: true, sortOrder: true },
  });
}

export async function listPqrsCategoriesForRead(input: {
  tenantId: string;
  actorRole: Role;
  includeInactive?: boolean;
}) {
  if (input.actorRole === "SUPER_ADMIN") throw new PqrsCategoryError("FORBIDDEN", "No tiene permisos");
  await ensureInitialPqrsCategoriesForTenant(input.tenantId);
  return prisma.pqrsCategory.findMany({
    where: { tenantId: input.tenantId, ...(input.includeInactive && input.actorRole !== "RESIDENTE" ? {} : { isActive: true }) },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, slug: true, displayName: true, isActive: true, workflowType: true, sortOrder: true },
  });
}
export async function listPqrsCategoriesForAdmin(input: { tenantId: string; actorRole: Role }) {
  requireAdmin(input.actorRole);
  await ensureInitialPqrsCategoriesForTenant(input.tenantId);
  return prisma.pqrsCategory.findMany({
    where: { tenantId: input.tenantId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

export async function createCustomPqrsCategory(input: {
  tenantId: string;
  actorUserId: string;
  actorRole: Role;
  displayName: unknown;
  sortOrder: unknown;
  workflowType: unknown;
}) {
  requireAdmin(input.actorRole);
  let displayName: string;
  let sortOrder: number;
  if (!isPqrsWorkflowType(input.workflowType)) throw new PqrsCategoryError("INVALID", "Workflow invalido");
  const workflowType = input.workflowType;
  try {
    displayName = normalizeCategoryDisplayName(input.displayName);
    sortOrder = normalizeCategorySortOrder(input.sortOrder);
  } catch (error) {
    throw new PqrsCategoryError("INVALID", error instanceof Error ? error.message : "Categoria invalida");
  }

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'pqrs-categories:' + input.tenantId}, 0))`;
      const tenant = await tx.tenant.findUnique({ where: { id: input.tenantId }, select: { id: true } });
      const membership = await tx.tenantMembership.findFirst({
        where: { tenantId: input.tenantId, userId: input.actorUserId, role: "ADMIN", isActive: true },
        select: { id: true },
      });
      if (!tenant || !membership) throw new PqrsCategoryError("NOT_FOUND", "Categoria no encontrada");
      await tx.pqrsCategory.createMany({ data: initialCategoryData(input.tenantId), skipDuplicates: true });
      const customCount = await tx.pqrsCategory.count({ where: { tenantId: input.tenantId, isCustom: true } });
      if (customCount >= MAX_CUSTOM_PQRS_CATEGORIES) {
        throw new PqrsCategoryError("LIMIT_REACHED", "Solo se permiten tres categorias personalizadas");
      }

      const base = categorySlugBase(displayName);
      const existing = new Set((await tx.pqrsCategory.findMany({
        where: { tenantId: input.tenantId, slug: { startsWith: base } },
        select: { slug: true },
      })).map((category) => category.slug));
      let slug = base;
      let suffix = 2;
      while (existing.has(slug)) {
        slug = `${base.slice(0, 55)}-${suffix}`;
        suffix += 1;
      }

      const category = await tx.pqrsCategory.create({
        data: {
          tenantId: input.tenantId,
          displayName,
          slug,
          isActive: true,
          isCustom: true,
          sortOrder,
          workflowType,
          createdByUserId: input.actorUserId,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: input.actorUserId,
          tenantId: input.tenantId,
          action: AuditAction.TENANT_UPDATED,
          targetType: "PqrsCategory",
          targetId: category.id,
          metadata: { event: "pqrs_category_created", slug, displayName, sortOrder, workflowType },
        },
      });
      return category;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      throw new PqrsCategoryError("CONFLICT", "El catalogo cambio; intenta nuevamente");
    }
    throw error;
  }
}

export async function updatePqrsCategory(input: {
  tenantId: string;
  actorUserId: string;
  actorRole: Role;
  categoryId: string;
  displayName?: unknown;
  isActive?: unknown;
  sortOrder?: unknown;
  workflowType?: unknown;
}) {
  requireAdmin(input.actorRole);
  const data: Prisma.PqrsCategoryUpdateInput = {};
  if (input.displayName !== undefined) {
    try { data.displayName = normalizeCategoryDisplayName(input.displayName); }
    catch (error) { throw new PqrsCategoryError("INVALID", error instanceof Error ? error.message : "Categoria invalida"); }
  }
  if (input.isActive !== undefined) {
    if (typeof input.isActive !== "boolean") throw new PqrsCategoryError("INVALID", "Estado invalido");
    data.isActive = input.isActive;
  }
  if (input.sortOrder !== undefined) {
    try { data.sortOrder = normalizeCategorySortOrder(input.sortOrder); }
    catch (error) { throw new PqrsCategoryError("INVALID", error instanceof Error ? error.message : "Orden invalido"); }
  }
  if (input.workflowType !== undefined) {
    if (!isPqrsWorkflowType(input.workflowType)) throw new PqrsCategoryError("INVALID", "Workflow invalido");
    data.workflowType = input.workflowType;
  }
  if (Object.keys(data).length === 0) throw new PqrsCategoryError("NO_CHANGES", "No hay cambios");

  return prisma.$transaction(async (tx) => {
    const membership = await tx.tenantMembership.findFirst({
      where: { tenantId: input.tenantId, userId: input.actorUserId, role: "ADMIN", isActive: true },
      select: { id: true },
    });
    if (!membership) throw new PqrsCategoryError("NOT_FOUND", "Categoria no encontrada");
    const before = await tx.pqrsCategory.findFirst({ where: { id: input.categoryId, tenantId: input.tenantId } });
    if (!before) throw new PqrsCategoryError("NOT_FOUND", "Categoria no encontrada");
    const after = await tx.pqrsCategory.update({ where: { id: before.id }, data });
    const changed = ["displayName", "isActive", "sortOrder", "workflowType"].filter(
      (field) => before[field as keyof typeof before] !== after[field as keyof typeof after]
    );
    if (changed.length === 0) throw new PqrsCategoryError("NO_CHANGES", "No hay cambios");
    await tx.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        tenantId: input.tenantId,
        action: AuditAction.TENANT_UPDATED,
        targetType: "PqrsCategory",
        targetId: after.id,
        metadata: {
          event: "pqrs_category_updated",
          fields: changed,
          before: { displayName: before.displayName, isActive: before.isActive, sortOrder: before.sortOrder, workflowType: before.workflowType },
          after: { displayName: after.displayName, isActive: after.isActive, sortOrder: after.sortOrder, workflowType: after.workflowType },
        },
      },
    });
    return after;
  });
}

// El residente no clasifica: solo describe su problema. La categoria la pone
// el administrador al abrir el caso, porque es quien conoce como se gestiona
// cada tipo de solicitud. Por eso puede devolver null.
// Si viene un categoryId explicito (creacion hecha por el admin, o datos
// heredados con `asunto`), se respeta y se valida.
export async function resolvePqrsCategoryForCreation(input: {
  tenantId: string;
  categoryId?: unknown;
  legacyAsunto?: unknown;
}) {
  await ensureInitialPqrsCategoriesForTenant(input.tenantId);
  const requestedId = typeof input.categoryId === "string" ? input.categoryId.trim() : "";
  if (requestedId) {
    const category = await prisma.pqrsCategory.findFirst({ where: { id: requestedId, tenantId: input.tenantId, isActive: true } });
    if (!category) throw new PqrsCategoryError("NOT_FOUND", "Categoria no disponible");
    return category;
  }
  if (typeof input.legacyAsunto === "string") {
    const canonicalKey = LEGACY_CATEGORY_CANONICAL_KEY[input.legacyAsunto];
    if (canonicalKey) {
      const category = await prisma.pqrsCategory.findFirst({ where: { tenantId: input.tenantId, canonicalKey, isActive: true } });
      if (category) return category;
    }
  }
  return null;
}

export function mapPqrsCategoryError(error: unknown): { status: number; message: string } {
  if (!(error instanceof PqrsCategoryError)) return { status: 500, message: "No se pudo completar la operacion" };
  if (error.code === "FORBIDDEN") return { status: 403, message: "No tiene permisos" };
  if (error.code === "NOT_FOUND") return { status: 404, message: "Categoria no encontrada" };
  if (error.code === "LIMIT_REACHED" || error.code === "NO_CHANGES" || error.code === "CONFLICT") return { status: 409, message: error.message };
  return { status: 400, message: error.message };
}
