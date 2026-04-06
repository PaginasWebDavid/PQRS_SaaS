import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Limpiando base de datos...");

  await prisma.historialPqrs.deleteMany();
  await prisma.pqrs.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.verificationToken.deleteMany();
  await prisma.user.deleteMany();

  const hash = (pw: string) => bcrypt.hashSync(pw, 10);

  await prisma.user.create({
    data: {
      email: "admoncallecien@gmail.com",
      password: hash("REDACTED_HISTORICAL_PASSWORD"),
      name: "Administración Calle 100",
      role: Role.ADMIN,
    },
  });

  await prisma.user.create({
    data: {
      email: "consejoadmoncallecien@gmail.com",
      password: hash("REDACTED_HISTORICAL_PASSWORD"),
      name: "Presidente del Consejo",
      role: Role.CONSEJO,
    },
  });

  console.log("Usuarios creados: 2");
  console.log("\n--- Credenciales ---");
  console.log("ADMIN:   admoncallecien@gmail.com / REDACTED_HISTORICAL_PASSWORD");
  console.log("CONSEJO: consejoadmoncallecien@gmail.com / REDACTED_HISTORICAL_PASSWORD");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
