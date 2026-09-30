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

/** Ответ /nomenclature/v1/group/list — поля отличаются от product/list */
type NomenclatureGroupsResponse = {
  groups?: Array<{
    groupId?: string;
    id?: string;
    name?: string;
    parentId?: string | null;
    parentGroupId?: string | null;
    isDeleted?: boolean;
    [key: string]: unknown;
  }>;
};

interface IikoGroupNormalized {
  id: string;
  name: string;
  parentGroupId: string | null;
  isDeleted: boolean;
  raw: IikoProductGroup;
}

export class IikoNomenclatureService {
  constructor(private readonly client: IikoHttpClient) {}

  async syncMenu(organizationIikoId = env.IIKO_ORGANIZATION_ID, limit = 1000) {
    console.log(`[syncMenu] Starting sync for organization: ${organizationIikoId}`);
    const organization = await prisma.organization.findUnique({ where: { iikoId: organizationIikoId } });
    if (!organization) {
      console.error(`[syncMenu] Organization not found: ${organizationIikoId}`);
      throw new HttpError("Organization must be synchronized before menu", 400);
    }
    console.log(`[syncMenu] Organization found: ${organization.name} (${organization.id})`);

    // Some iiko endpoints have a max limit of 100
    const effectiveLimit = Math.min(limit, 1000);
    
    let offset = 0;
    const seen = new Set<string>();
    let synced = 0;
    let revision: string | undefined;
    let total: number | undefined;

    // Группы лежат в отдельном эндпоинте: /nomenclature/v1/product/list их не возвращает
    const groups = await this.fetchGroups(effectiveLimit);
    const groupIds = new Set<string>();
    for (const group of groups) {
      if (group.isDeleted) continue;
      groupIds.add(group.id);
      await prisma.productGroup.upsert({
        where: { groupId: group.id },
        update: {
          organizationId: organization.id,
          name: group.name,
          parentGroupId: group.parentGroupId ?? undefined,
          rawData: group.raw as Prisma.InputJsonObject
        },
        create: {
          groupId: group.id,
          organizationId: organization.id,
          name: group.name,
          parentGroupId: group.parentGroupId ?? undefined,
          rawData: group.raw as Prisma.InputJsonObject
        }
      });
    }
    console.log(`[syncMenu] Synced ${groupIds.size} product groups`);

    while (true) {
      console.log(`[syncMenu] Fetching page: offset=${offset}, limit=${effectiveLimit}`);
      // withCount/withTotalCount больше не принимаются iiko (400) — страницаем до неполной страницы
      const data = await this.client.post<NomenclatureResponse>(
        "/nomenclature/v1/product/list",
        { limit: effectiveLimit, offset, filters: [] },
        "iiko.nomenclature.products"
      );
      console.log(`[syncMenu] Response received: revision=${data.revision}, totalCount=${data.totalCount}, count=${data.count}, products.length=${(data.products ?? data.items ?? []).length}`);
      revision = data.revision === undefined ? revision : String(data.revision);
      const products = data.products ?? data.items ?? [];

      // Capture total from first response (iiko may not return totalCount on subsequent pages)
      if (total === undefined) {
        total = data.totalCount ?? data.count;
        console.log(`[syncMenu] Total products: ${total}, limit: ${effectiveLimit}, offset: ${offset}, received: ${products.length}`);
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

      offset += products.length;
      console.log(`[syncMenu] Page done: synced=${synced}, offset=${offset}, total=${total}, productsInPage=${products.length}`);
      // Stop if: fewer products than limit (last page), or we've reached the known total
      if (products.length < effectiveLimit || (total !== undefined && offset >= total)) {
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

  /**
   * Список групп номенклатуры из /nomenclature/v1/group/list.
   * Эндпоинт не принимает organizationId — область определяется токеном,
   * и не возвращает totalCount — страницаем до неполной страницы.
   */
  private async fetchGroups(limit: number): Promise<IikoGroupNormalized[]> {
    const result: IikoGroupNormalized[] = [];
    let offset = 0;
    while (true) {
      const data = await this.client.post<NomenclatureGroupsResponse>(
        "/nomenclature/v1/group/list",
        { limit, offset, filters: [] },
        "iiko.nomenclature.groups"
      );
      const page = data.groups ?? [];
      for (const group of page) {
        const id = group.groupId ?? group.id;
        if (!id || !group.name) continue;
        result.push({
          id,
          name: group.name,
          parentGroupId: group.parentId ?? group.parentGroupId ?? null,
          isDeleted: group.isDeleted ?? false,
          raw: group as IikoProductGroup
        });
      }
      offset += page.length;
      if (page.length < limit) break;
    }
    return result;
  }
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  return value === undefined ? undefined : (value as Prisma.InputJsonValue);
}
