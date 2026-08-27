import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createBulkInvitations } from "@/domains/organizations/invitation.service";
import {
  ensureInvitableRole,
  MAX_BULK_INVITATIONS,
  prepareBulkInvitationEmails,
} from "@/domains/organizations/invitation-security";
import { resolveUserManagementAccess } from "@/domains/organizations/user-management-access";
import { getAuthorizationErrorResponse } from "@/lib/authorization-response";
import { assertSafeXlsxArchive } from "@/lib/xlsx-security";

const MAX_FILE_BYTES = 2 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const session = await auth();
  let access;
  try {
    access = await resolveUserManagementAccess(
      session,
      req.nextUrl.searchParams.get("tenantId")
    );
  } catch (error) {
    const response = getAuthorizationErrorResponse(error);
    if (response) return response;
    throw error;
  }

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Debes adjuntar un archivo Excel (.xlsx)" },
      { status: 400 }
    );
  }
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return NextResponse.json(
      { error: "Solo se permiten archivos .xlsx" },
      { status: 400 }
    );
  }
  if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: "El archivo pesa demasiado o esta vacio" },
      { status: 400 }
    );
  }

  let role;
  try {
    role = ensureInvitableRole(formData?.get("role") ?? "RESIDENTE");
  } catch {
    return NextResponse.json({ error: "Rol invalido" }, { status: 400 });
  }

  const workbook = new ExcelJS.Workbook();
  try {
    const workbookInput = await file.arrayBuffer();
    assertSafeXlsxArchive(workbookInput);
    await workbook.xlsx.load(workbookInput);
  } catch {
    return NextResponse.json(
      { error: "No se pudo leer el archivo .xlsx" },
      { status: 400 }
    );
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return NextResponse.json(
      { error: "El archivo no tiene hojas con datos" },
      { status: 400 }
    );
  }

  const firstColumn: unknown[] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    firstColumn.push(row.getCell(1).text);
  });

  let emails: string[];
  try {
    emails = prepareBulkInvitationEmails(
      firstColumn,
      MAX_BULK_INVITATIONS
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "El archivo contiene datos invalidos",
      },
      { status: 400 }
    );
  }

  try {
    const results = await createBulkInvitations({
      tenantId: access.tenantId,
      emails,
      role,
      invitedById: access.actorUserId,
      origin: req.headers.get("x-forwarded-for") || "bulk-upload",
    });
    const created = results.filter((result) => result.ok).length;
    const emailPending = results.filter(
      (result) => result.ok && result.emailSent === false
    ).length;
    return NextResponse.json({
      mode: "PARTIAL",
      total: emails.length,
      created,
      emailPending,
      failed: results.filter((result) => !result.ok),
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudo procesar el lote de invitaciones" },
      { status: 500 }
    );
  }
}
