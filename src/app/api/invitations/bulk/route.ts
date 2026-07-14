import ExcelJS from "exceljs";
import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getTenantIdFromSession } from "@/domains/organizations/tenant.service";
import { getTenantAccessResponse } from "@/lib/tenant-access-response";
import { createBulkInvitations } from "@/domains/organizations/invitation.service";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ROWS = 500;
const SELECTABLE_ROLES: Role[] = ["ADMIN", "CONSEJO", "RESIDENTE"];

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const tenantAccessResponse = await getTenantAccessResponse(session);
  if (tenantAccessResponse) return tenantAccessResponse;

  const tenantId = getTenantIdFromSession(session);

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  const roleRaw = String(formData?.get("role") || "RESIDENTE").toUpperCase();
  const role = SELECTABLE_ROLES.includes(roleRaw as Role) ? (roleRaw as Role) : null;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Debes adjuntar un archivo Excel (.xlsx)" }, { status: 400 });
  }
  if (!role) {
    return NextResponse.json({ error: "Rol inválido" }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(arrayBuffer);
  } catch {
    return NextResponse.json({ error: "No se pudo leer el archivo. Verifica que sea un .xlsx válido" }, { status: 400 });
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return NextResponse.json({ error: "El archivo no tiene hojas con datos" }, { status: 400 });
  }

  const emails: string[] = [];
  sheet.eachRow((row) => {
    const raw = String(row.getCell(1).text || "").trim().toLowerCase();
    if (EMAIL_REGEX.test(raw)) emails.push(raw);
  });

  if (emails.length === 0) {
    return NextResponse.json({ error: "No se encontraron correos válidos en la primera columna del archivo" }, { status: 400 });
  }
  if (emails.length > MAX_ROWS) {
    return NextResponse.json({ error: `El archivo tiene ${emails.length} correos; el máximo por carga es ${MAX_ROWS}` }, { status: 400 });
  }

  const results = await createBulkInvitations({
    tenantId,
    emails,
    role,
    invitedById: session.user.id,
    origin: req.headers.get("x-forwarded-for") || "bulk-upload",
  });

  const created = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  return NextResponse.json({ total: emails.length, created, failed });
}
