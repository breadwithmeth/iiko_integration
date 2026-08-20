import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export async function authRoutes(app: FastifyInstance) {
  app.post("/api/auth/login", async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user || !user.active || !(await bcrypt.compare(input.password, user.passwordHash))) {
      return reply.code(401).send({ message: "Invalid credentials" });
    }

    const jti = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
    await prisma.session.create({
      data: {
        userId: user.id,
        jti,
        expiresAt,
        userAgent: request.headers["user-agent"],
        ip: request.ip
      }
    });

    await prisma.auditLog.create({ data: { userId: user.id, event: "auth.login" } });
    const token = app.jwt.sign({ sub: user.id, role: user.role, jti, name: user.name, email: user.email }, { expiresIn: "12h" });
    return { token, user: publicUser(user) };
  });

  app.post("/api/auth/logout", { preHandler: [app.authenticate] }, async (request) => {
    await prisma.session.updateMany({ where: { jti: request.user.jti }, data: { revokedAt: new Date() } });
    await prisma.auditLog.create({ data: { userId: request.user.sub, event: "auth.logout" } });
    return { ok: true };
  });

  app.get("/api/me", { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = await prisma.user.findUnique({ where: { id: request.user.sub } });
    if (!user) {
      return reply.code(404).send({ message: "User not found" });
    }
    return publicUser(user);
  });
}

function publicUser(user: { id: string; email: string; name: string; role: string }) {
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}
