import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { getTenantIdFromSession } from "@/domains/organizations/tenant.service";
import { getTenantAccessResponse } from "@/lib/tenant-access-response";
import { isRecord } from "@/domains/pqrs/pqrs-security";
import {
  createCustomPqrsCategory,
  listPqrsCategoriesForAdmin,
  mapPqrsCategoryError,
  updatePqrsCategory,
} from "@/domains/pqrs/pqrs-category.service";

async function adminIdentity() {
  const session = await auth();
  if (!session?.user) return { response: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  if (session.user.role !== "ADMIN") return { response: NextResponse.json({ error: "No tiene permisos" }, { status: 403 }) };
  const access = await getTenantAccessResponse(session);
  if (access) return { response: access };
  return {
    session,
    tenantId: getTenantIdFromSession(session),
    actorUserId: session.user.id,
    actorRole: session.user.role as Role,
  };
}

export async function GET() {
  const identity = await adminIdentity();
  if ("response" in identity) return identity.response;
  try {
    return NextResponse.json(await listPqrsCategoriesForAdmin(identity));
  } catch (error) {
    const mapped = mapPqrsCategoryError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

export async function POST(req: NextRequest) {
  const identity = await adminIdentity();
  if ("response" in identity) return identity.response;
  const body = await req.json().catch(() => null);
  if (!isRecord(body)) return NextResponse.json({ error: "Cuerpo invalido" }, { status: 400 });
  if (["tenantId", "slug", "id", "createdByUserId", "canonicalKey"].some((key) => key in body)) {
    return NextResponse.json({ error: "Campos no permitidos" }, { status: 400 });
  }
  try {
    const category = await createCustomPqrsCategory({
      ...identity,
      displayName: body.displayName,
      sortOrder: body.sortOrder,
      workflowType: body.workflowType,
    });
    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    const mapped = mapPqrsCategoryError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

export async function PATCH(req: NextRequest) {
  const identity = await adminIdentity();
  if ("response" in identity) return identity.response;
  const body = await req.json().catch(() => null);
  if (!isRecord(body) || typeof body.categoryId !== "string") {
    return NextResponse.json({ error: "Cuerpo invalido" }, { status: 400 });
  }
  const allowed = new Set(["categoryId", "displayName", "isActive", "sortOrder", "workflowType"]);
  if (Object.keys(body).some((key) => !allowed.has(key))) {
    return NextResponse.json({ error: "Campos no permitidos" }, { status: 400 });
  }
  try {
    const category = await updatePqrsCategory({
      ...identity,
      categoryId: body.categoryId,
      displayName: body.displayName,
      isActive: body.isActive,
      sortOrder: body.sortOrder,
      workflowType: body.workflowType,
    });
    return NextResponse.json(category);
  } catch (error) {
    const mapped = mapPqrsCategoryError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}