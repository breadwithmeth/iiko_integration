import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { ZodError } from "zod";
import { env } from "./lib/env.js";
import { prisma } from "./lib/prisma.js";
import { authenticate } from "./middleware/auth.js";
import { authRoutes } from "./modules/auth/routes.js";
import { iikoRoutes } from "./modules/iiko/routes.js";
import { orderRoutes } from "./modules/orders/routes.js";
import { productRoutes } from "./modules/products/routes.js";
import { userRoutes } from "./modules/users/routes.js";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: typeof authenticate;
  }
}

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "test" ? "silent" : "info",
      redact: ["req.headers.authorization", "password", "token", "apiKey", "clientSecret"]
    }
  });

  await app.register(helmet);
  await app.register(cors, { origin: env.WEB_ORIGIN, credentials: true });
  await app.register(rateLimit, { max: 600, timeWindow: "1 minute" });
  await app.register(jwt, { secret: env.JWT_SECRET });
  app.decorate("authenticate", authenticate);

  app.setErrorHandler(async (error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ message: "Validation error", issues: error.issues });
    }
    app.log.error(error);
    const message = error instanceof Error ? error.message : "Unknown error";
    const name = error instanceof Error ? error.name : "UnknownError";
    await prisma.apiError.create({
      data: {
        source: "backend",
        message,
        detail: { name }
      }
    }).catch(() => undefined);
    return reply.code(500).send({ message: "Internal server error" });
  });

  app.get("/health", async () => ({ ok: true }));
  await app.register(authRoutes);
  await app.register(iikoRoutes);
  await app.register(productRoutes);
  await app.register(orderRoutes);
  await app.register(userRoutes);

  return app;
}
