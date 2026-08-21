import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { ZodError } from "zod";
import { env } from "./lib/env.js";
import { HttpError } from "./lib/HttpError.js";
import { prisma } from "./lib/prisma.js";
import { authenticate } from "./middleware/auth.js";
import { authRoutes } from "./modules/auth/routes.js";
import { iikoRoutes } from "./modules/iiko/routes.js";
import { orderRoutes } from "./modules/orders/routes.js";
import { productRoutes } from "./modules/products/routes.js";
import { userRoutes } from "./modules/users/routes.js";
import { IikoAuthService } from "./services/IikoAuthService.js";
import { IikoOrderStatusService } from "./services/IikoOrderStatusService.js";

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
  await app.register(rateLimit, { max: 600, timeWindow: "1 minute" });
  await app.register(jwt, { secret: env.JWT_SECRET });
  app.decorate("authenticate", authenticate);

  // Initialize order status check service and start scheduled job
  const authService = new IikoAuthService();
  const orderStatusService = new IikoOrderStatusService(authService);
  
  // Start scheduled order status checking (every 5 minutes by default)
  const checkInterval = parseInt(String(env.ORDER_STATUS_CHECK_INTERVAL_MINUTES), 10) || 5;
  orderStatusService.startScheduledCheck(checkInterval);
  
  // Store service on app for potential cleanup
  app.decorate("orderStatusService", orderStatusService);

app.setErrorHandler(async (error, _request, reply) => {
  if (error instanceof ZodError) {
    return reply.code(400).send({ message: "Validation error", issues: error.issues });
  }
  if (error instanceof HttpError) {
    app.log.error(error);
    await prisma.apiError.create({
      data: {
        source: "backend",
        message: error.message,
        detail: { name: error.name, status: error.status }
      }
    }).catch(() => undefined);
    return reply.code(error.status).send({ message: error.message });
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
  
  // CORS helper
  const getOrigin = (request: { headers: { origin?: string } }) => {
    const requestOrigin = request.headers.origin;
    const allowedOrigin = env.WEB_ORIGIN || "*";
    // Cannot use "*" with credentials
    if (requestOrigin && allowedOrigin !== "*") {
      return requestOrigin;
    }
    return allowedOrigin;
  };
  
  // Handle OPTIONS preflight
  app.addHook("onRequest", async (request, reply) => {
    if (request.method === "OPTIONS") {
      const origin = getOrigin(request);
      reply.header("Access-Control-Allow-Origin", origin);
      reply.header("Access-Control-Allow-Credentials", "true");
      reply.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
      reply.header("Access-Control-Allow-Headers", "Origin, Content-Type, Authorization, Accept");
      reply.header("Access-Control-Max-Age", "86400");
      reply.code(204).send();
    }
  });
  
  // Add CORS headers to all responses
  app.addHook("onSend", async (request, reply) => {
    const origin = getOrigin(request);
    reply.header("Access-Control-Allow-Origin", origin);
    reply.header("Access-Control-Allow-Credentials", "true");
  });
  
  await app.register(authRoutes);
  await app.register(iikoRoutes);
  await app.register(productRoutes);
  await app.register(orderRoutes);
  await app.register(userRoutes);

  return app;
}
