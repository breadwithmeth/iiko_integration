import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../../lib/env.js";
import { prisma } from "../../lib/prisma.js";
import { IikoAuthService } from "../../services/IikoAuthService.js";
import { IikoDirectoryService } from "../../services/IikoDirectoryService.js";
import { IikoHttpClient } from "../../services/IikoHttpClient.js";
import { IikoNomenclatureService } from "../../services/IikoNomenclatureService.js";
import { requireRole } from "../../middleware/auth.js";

const querySchema = z.object({ organizationId: z.string().optional() });

export async function iikoRoutes(app: FastifyInstance) {
  const auth = new IikoAuthService();
  const client = new IikoHttpClient(auth);
  const directories = new IikoDirectoryService(client);
  const nomenclature = new IikoNomenclatureService(client);

  app.get("/api/iiko/organizations", { preHandler: [app.authenticate] }, async () => {
    const cached = await prisma.organization.findMany({ orderBy: { name: "asc" } });
    if (cached.length) return cached;
    return directories.syncOrganizations();
  });

  app.get("/api/iiko/terminal-groups", { preHandler: [app.authenticate] }, async (request) => {
    const query = querySchema.parse(request.query);
    const organizationIikoId = query.organizationId ?? env.IIKO_ORGANIZATION_ID;
    const organization = await prisma.organization.findUnique({ where: { iikoId: organizationIikoId } });
    const cached = organization
      ? await prisma.terminalGroup.findMany({ where: { organizationId: organization.id, disabled: false }, orderBy: { name: "asc" } })
      : [];
    if (cached.length) return cached;
    return directories.syncTerminalGroups(organizationIikoId);
  });

  app.get("/api/iiko/order-types", { preHandler: [app.authenticate] }, async (request) => {
    const query = querySchema.parse(request.query);
    const organizationIikoId = query.organizationId ?? env.IIKO_ORGANIZATION_ID;
    const organization = await prisma.organization.findUnique({ where: { iikoId: organizationIikoId } });
    const cached = organization
      ? await prisma.orderType.findMany({ where: { organizationId: organization.id, isDeleted: false }, orderBy: { name: "asc" } })
      : [];
    if (cached.length) return cached;
return directories.syncOrderTypes(organizationIikoId);
          });

          // New endpoint: fetch raw order types from iiko (no DB persistence)
          app.post("/api/iiko/order-types/raw", { preHandler: [app.authenticate] }, async (request) => {
            const bodySchema = z.object({ organizationIds: z.array(z.string()).min(1) });
            const { organizationIds } = bodySchema.parse(request.body as any);
            // Use the existing directory service to fetch raw data
            const raw = await directories.fetchOrderTypesRaw(organizationIds);
            return raw;
          });

          app.get("/api/iiko/payment-types", { preHandler: [app.authenticate] }, async (request) => {
  // Existing handler for payment types

    const query = querySchema.parse(request.query);
    const organizationIikoId = query.organizationId ?? env.IIKO_ORGANIZATION_ID;
    const organization = await prisma.organization.findUnique({ where: { iikoId: organizationIikoId } });
    const cached = organization
      ? await prisma.paymentType.findMany({ where: { organizationId: organization.id, isDeleted: false }, orderBy: { name: "asc" } })
      : [];
    if (cached.length) return cached;
    return directories.syncPaymentTypes(organizationIikoId);
  });

  app.post("/api/iiko/sync/menu", requireRole(app, ["ADMIN"]), async (request) => {
    const query = querySchema.parse(request.query);
    const result = await nomenclature.syncMenu(query.organizationId ?? env.IIKO_ORGANIZATION_ID);
    await prisma.auditLog.create({ data: { userId: request.user.sub, event: "iiko.menu.sync", metadata: result } });
    return result;
  });

  app.post("/api/iiko/sync/directories", requireRole(app, ["ADMIN"]), async () => {
    const organizations = await directories.syncOrganizations();
    const organizationId = env.IIKO_ORGANIZATION_ID || organizations[0]?.iikoId;
    const [terminalGroups, orderTypes, paymentTypes] = await Promise.all([
      directories.syncTerminalGroups(organizationId),
      directories.syncOrderTypes(organizationId),
      directories.syncPaymentTypes(organizationId)
    ]);
    return { organizations, terminalGroups, orderTypes, paymentTypes };
  });
}
