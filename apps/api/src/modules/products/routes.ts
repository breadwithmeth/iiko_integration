import { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";

const listQuerySchema = z.object({
  search: z.string().optional().default(""),
  category: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(60)
});

export async function productRoutes(app: FastifyInstance) {
  app.get("/api/products", { preHandler: [app.authenticate] }, async (request) => {
    const query = listQuerySchema.parse(request.query);
    const where: Prisma.ProductWhereInput = { deleted: false };

    if (query.category) {
      where.parentGroupId = query.category;
    }
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: "insensitive" } },
        { article: { contains: query.search, mode: "insensitive" } },
        { code: { contains: query.search, mode: "insensitive" } }
      ];
    }

    const [items, total, groups] = await Promise.all([
      prisma.product.findMany({
        where,
        include: { group: true },
        orderBy: { name: "asc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      }),
      prisma.product.count({ where }),
      prisma.productGroup.findMany({ orderBy: { name: "asc" } })
    ]);

    return {
      items: items.map((product) => ({
        ...product,
        defaultSalePrice: Number(product.defaultSalePrice),
        groupName: product.group?.name ?? null
      })),
      total,
      groups
    };
  });

  app.get("/api/products/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const product = await prisma.product.findUnique({ where: { id: params.id }, include: { group: true } });
    if (!product) {
      return reply.code(404).send({ message: "Product not found" });
    }
    return { ...product, defaultSalePrice: Number(product.defaultSalePrice), groupName: product.group?.name ?? null };
  });
}
