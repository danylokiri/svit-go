/**
 * Bootstraps the super-admin account for /admin login.
 *
 * Credentials come from the environment (ADMIN_EMAIL / ADMIN_PASSWORD) and are
 * never stored in the repository.
 *
 * Runs idempotently: if the admin already exists, it's skipped. Useful when
 * the schema is repushed during development — we don't want to overwrite a
 * password the developer may have already changed.
 */
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SUPER_EMAIL = process.env.ADMIN_EMAIL ?? "admin@svitgo.app";
const SUPER_PASSWORD = process.env.ADMIN_PASSWORD;
const SUPER_NAME = "SvitGo Super Admin";

async function main() {
  if (!SUPER_PASSWORD || SUPER_PASSWORD.length < 10) {
    throw new Error("Set ADMIN_PASSWORD (at least 10 characters) in the environment before running db:seed:admin");
  }
  const existing = await prisma.admin.findUnique({ where: { email: SUPER_EMAIL } });
  if (existing) {
    console.log(`✓ Super admin already exists (id=${existing.id}, role=${existing.role}) — skipping`);
    return;
  }
  const passwordHash = await bcrypt.hash(SUPER_PASSWORD, 10);
  const admin = await prisma.admin.create({
    data: {
      email: SUPER_EMAIL,
      name: SUPER_NAME,
      passwordHash,
      role: "super",
    },
  });
  console.log(`✓ Super admin created (id=${admin.id})`);
  console.log(`  Email:    ${SUPER_EMAIL}`);
  console.log(`  URL:      /admin/login`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
