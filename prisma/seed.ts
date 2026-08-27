import "dotenv/config";
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  INITIAL_TENANT_ID,
  INITIAL_TENANT_NAME,
  INITIAL_TENANT_SLUG,
} from "../src/domains/organizations/tenant.constants";

const prisma = new PrismaClient();

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta ${name}. El seed no usa credenciales por defecto.`);
  return value;
}

async function ensureMembership(userId: string, tenantId: string, role: Role) {
  await prisma.tenantMembership.upsert({
    where: { userId_tenantId: { userId, tenantId } },
    update: { role, isActive: true },
    create: { userId, tenantId, role, isActive: true },
  });
}

async function main() {
  const demoPassword = requiredEnv("CALLE_100_DEMO_PASSWORD");
  const superAdminEmail = requiredEnv("SUPER_ADMIN_EMAIL").toLowerCase();
  const superAdminPassword = requiredEnv("SUPER_ADMIN_PASSWORD");
  const passwordHash = await bcrypt.hash(demoPassword, 10);
  const superAdminHash = await bcrypt.hash(superAdminPassword, 10);

  const tenant = await prisma.tenant.upsert({
    where: { slug: INITIAL_TENANT_SLUG },
    update: {
      name: INITIAL_TENANT_NAME,
      status: "ACTIVE",
      units: 1,
    },
    create: {
      id: INITIAL_TENANT_ID,
      name: INITIAL_TENANT_NAME,
      slug: INITIAL_TENANT_SLUG,
      status: "ACTIVE",
      units: 1,
    },
  });

  const superAdmin = await prisma.user.upsert({
    where: { email: superAdminEmail },
    update: { isActive: true, role: Role.SUPER_ADMIN, tenantId: null },
    create: {
      email: superAdminEmail,
      password: superAdminHash,
      name: "SUPER_ADMIN PQRS Services",
      role: Role.SUPER_ADMIN,
      tenantId: null,
    },
  });

  const admin = await prisma.user.upsert({
    where: { email: "admoncallecien@gmail.com" },
    update: { isActive: true, role: Role.ADMIN, tenantId: tenant.id },
    create: {
      email: "admoncallecien@gmail.com",
      password: passwordHash,
      name: "Administracion Calle 100",
      role: Role.ADMIN,
      tenantId: tenant.id,
    },
  });
  await ensureMembership(admin.id, tenant.id, Role.ADMIN);

  const consejo = await prisma.user.upsert({
    where: { email: "consejoadmoncallecien@gmail.com" },
    update: { isActive: true, role: Role.CONSEJO, tenantId: tenant.id },
    create: {
      email: "consejoadmoncallecien@gmail.com",
      password: passwordHash,
      name: "Presidente del Consejo",
      role: Role.CONSEJO,
      tenantId: tenant.id,
    },
  });
  await ensureMembership(consejo.id, tenant.id, Role.CONSEJO);

  console.log(`Seed seguro listo para ${tenant.name}.`);
  console.log(`Super Admin confirmado: ${superAdmin.email}`);
  console.log("No se eliminaron conjuntos, usuarios, PQRS ni pagos existentes.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
