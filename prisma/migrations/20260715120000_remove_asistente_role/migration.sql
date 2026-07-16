-- ASISTENTE role is being removed permanently; reassign any stray rows defensively.
UPDATE "User" SET role = 'ADMIN' WHERE role = 'ASISTENTE';
UPDATE "Invitation" SET role = 'ADMIN' WHERE role = 'ASISTENTE';

ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;

ALTER TYPE "Role" RENAME TO "Role_old";
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'CONSEJO', 'RESIDENTE');
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role" USING (role::text::"Role");
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'RESIDENTE';
ALTER TABLE "Invitation" ALTER COLUMN "role" TYPE "Role" USING (role::text::"Role");
DROP TYPE "Role_old";
