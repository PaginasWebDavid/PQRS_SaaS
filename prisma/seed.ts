import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  INITIAL_TENANT_ID,
  INITIAL_TENANT_NAME,
  INITIAL_TENANT_SLUG,
} from "../src/domains/organizations/tenant.constants";

const prisma = new PrismaClient();

async function main() {
  console.log("Limpiando base de datos...");

  await prisma.auditLog.deleteMany();
  await prisma.historialPqrs.deleteMany();
  await prisma.pqrsFoto.deleteMany();
  await prisma.pqrs.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.verificationToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();

  const tenant = await prisma.tenant.create({
    data: {
      id: INITIAL_TENANT_ID,
      name: INITIAL_TENANT_NAME,
      slug: INITIAL_TENANT_SLUG,
      status: "ACTIVE",
      units: 1,
    },
  });

  const hash = (pw: string) => bcrypt.hashSync(pw, 10);
  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL || "superadmin@pqrs.local";
  const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD || "superadmin123";

  await prisma.user.create({
    data: {
      email: superAdminEmail,
      password: hash(superAdminPassword),
      name: "SUPER_ADMIN PQRS Services",
      role: Role.SUPER_ADMIN,
      tenantId: null,
    },
  });

  await prisma.user.create({
    data: {
      email: "admoncallecien@gmail.com",
      password: hash("calle100"),
      name: "Administración Calle 100",
      role: Role.ADMIN,
      tenantId: tenant.id,
    },
  });

  await prisma.user.create({
    data: {
      email: "consejoadmoncallecien@gmail.com",
      password: hash("Auditoría"),
      name: "Presidente del Consejo",
      role: Role.CONSEJO,
      tenantId: tenant.id,
    },
  });

  console.log("Tenant inicial creado: 1");
  console.log("Usuarios creados: 3");
  console.log("\n--- Credenciales ---");
  console.log(`SUPER_ADMIN: ${superAdminEmail} / ${superAdminPassword}`);
  console.log("ADMIN:       admoncallecien@gmail.com / calle100");
  console.log("CONSEJO:     consejoadmoncallecien@gmail.com / Auditoría");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });