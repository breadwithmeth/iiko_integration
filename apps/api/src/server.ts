import { buildApp } from "./app.js";
import { env } from "./lib/env.js";
import { prisma } from "./lib/prisma.js";

const app = await buildApp();

try {
  await app.listen({ port: env.API_PORT, host: "0.0.0.0" });
} catch (error) {
  app.log.error(error);
  await prisma.$disconnect();
  process.exit(1);
}
