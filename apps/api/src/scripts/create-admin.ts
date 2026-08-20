import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
const name = process.env.ADMIN_NAME ?? "Администратор";

if (!email || !password) {
  throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD");
}

const user = await prisma.user.upsert({
  where: { email },
  update: { name, role: "ADMIN", active: true, passwordHash: await bcrypt.hash(password, 12) },
  create: { email, name, role: "ADMIN", passwordHash: await bcrypt.hash(password, 12) }
});

console.log(`Admin ready: ${user.email}`);
await prisma.$disconnect();
