import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { env } from "../lib/env.js";
import { HttpError } from "../lib/HttpError.js";
import type { IikoProduct, IikoProductGroup } from "../types/iiko.js";
import { IikoHttpClient } from "./IikoHttpClient.js";

type NomenclatureResponse = {
  products?: IikoProduct[];
  items?: IikoProduct[];
  productGroups?: IikoProductGroup[];
  groups?: IikoProductGroup[];
  totalCount?: number;
  count?: number;
  revision?: string | number;
};

export class IikoNomenclatureService {
  constructor(private readonly client: IikoHttpClient) {}

  async syncMenu(organizationIikoId = env.IIKO_ORGANIZATION_ID) {
    const organization = await prisma.organization.findUnique({ where: { iikoId: organizationIikoId } });
    if (!organization) {
      throw new HttpError("Organization must be synchronized before menu", 400);
    }

    const limit = 100;
    let offset = 0;
    const seen = new Set<string>();
    let synced = 0;
    let revision: string | undefined;

    while (true) {
      const data = await this.client.post<NomenclatureResponse>(
        "/nomenclature/v1/product/list",
        { limit, offset, withCount: true, withTotalCount: true, filters: [] },
        "iiko.nomenclature.products"
      );
      revision = data.revision === undefined ? revision : String(data.revision);
      const products = data.products ?? data.items ?? [];
const groups = data.productGroups ?? data.groups ?? [];
// Build a set of group IDs that were present in this response,
// so we can safely reference them when linking products.
const groupIds = new Set<string>(groups.map((g) => g.id));
for (const group of groups) {
        await prisma.productGroup.upsert({
          where: { groupId: group.id },
          update: {
            organizationId: organization.id,
            name: group.name,
            parentGroupId: group.parentGroupId ?? group.parentGroup ?? undefined,
            rawData: group as Prisma.InputJsonObject
          },
          create: {
            groupId: group.id,
            organizationId: organization.id,
            name: group.name,
            parentGroupId: group.parentGroupId ?? group.parentGroup ?? undefined,
            rawData: group as Prisma.InputJsonObject
          }
        });
      }

      for (const product of products) {
        seen.add(product.productId);
        const imageUrl = product.images?.[0]?.imageUrl ?? product.images?.[0]?.url ?? null;
        await prisma.product.upsert({
          where: { productId: product.productId },
          update: {
            organizationId: organization.id,
            name: product.name,
            type: product.type,
            article: product.productArticle,
            code: product.code,
            description: product.description,
            parentGroupId: product.parentGroupId && groupIds.has(product.parentGroupId) ? product.parentGroupId : undefined,
            defaultSalePrice: new Prisma.Decimal(product.defaultSalePrice ?? 0),
            imageUrl,
            productSizeId: product.productSizeId,
            modifierSchemaId: product.modifierSchemaId,
            modifierSchemaRedefinitions: toJson(product.modifierSchemaRedefinitions),
            modifiers: toJson(product.modifiers),
            rawData: product as Prisma.InputJsonObject,
            revision,
            modifiedAt: product.modifiedAt ? new Date(product.modifiedAt) : undefined,
            deleted: false
          },
          create: {
            productId: product.productId,
            organizationId: organization.id,
            name: product.name,
            type: product.type,
            article: product.productArticle,
            code: product.code,
            description: product.description,
            parentGroupId: product.parentGroupId && groupIds.has(product.parentGroupId) ? product.parentGroupId : undefined,
            defaultSalePrice: new Prisma.Decimal(product.defaultSalePrice ?? 0),
            imageUrl,
            productSizeId: product.productSizeId,
            modifierSchemaId: product.modifierSchemaId,
            modifierSchemaRedefinitions: toJson(product.modifierSchemaRedefinitions),
            modifiers: toJson(product.modifiers),
            rawData: product as Prisma.InputJsonObject,
            revision,
            modifiedAt: product.modifiedAt ? new Date(product.modifiedAt) : undefined
          }
        });
        synced += 1;
      }

      const total = data.totalCount ?? data.count;
      offset += products.length;
      if (products.length < limit || (total !== undefined && offset >= total)) {
        break;
      }
    }

    if (seen.size > 0) {
      await prisma.product.updateMany({
        where: { organizationId: organization.id, productId: { notIn: [...seen] } },
        data: { deleted: true }
      });
    }

    return { synced, revision };
  }
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  return value === undefined ? undefined : (value as Prisma.InputJsonValue);
}
