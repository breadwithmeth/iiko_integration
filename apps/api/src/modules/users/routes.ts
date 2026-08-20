import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireRole } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8),
  role: z.enum(["ADMIN", "OPERATOR"]).default("OPERATOR")
});

export async function userRoutes(app: FastifyInstance) {
  app.get("/api/users", requireRole(app, ["ADMIN"]), async () => {
    return prisma.user.findMany({
      select: { id: true, email: true, name: true, role: true, active: true, createdAt: true },
      orderBy: { createdAt: "desc" }
    });
  });

  app.post("/api/users", requireRole(app, ["ADMIN"]), async (request) => {
    const input = createUserSchema.parse(request.body);
    const user = await prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        role: input.role,
        passwordHash: await bcrypt.hash(input.password, 12)
      },
      select: { id: true, email: true, name: true, role: true, active: true, createdAt: true }
    });
    await prisma.auditLog.create({ data: { userId: request.user.sub, event: "user.create", entity: "User", entityId: user.id } });
    return user;
  });
}
