import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Role } from "@iiko-call-center/shared";
import { prisma } from "../lib/prisma.js";

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
    const session = await prisma.session.findUnique({ where: { jti: request.user.jti } });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      return reply.code(401).send({ message: "Session expired" });
    }
  } catch {
    return reply.code(401).send({ message: "Unauthorized" });
  }
}

export function requireRole(app: FastifyInstance, roles: Role[]) {
  return {
    preHandler: [
      app.authenticate,
      async (request: FastifyRequest, reply: FastifyReply) => {
        if (!roles.includes(request.user.role)) {
          return reply.code(403).send({ message: "Forbidden" });
        }
      }
    ]
  };
}
