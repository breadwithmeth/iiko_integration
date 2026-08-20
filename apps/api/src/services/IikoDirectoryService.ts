import { prisma } from "../lib/prisma.js";
import { env } from "../lib/env.js";
import type { IikoOrganization } from "../types/iiko.js";
import { IikoHttpClient } from "./IikoHttpClient.js";
import { Prisma } from "@prisma/client";

type JsonRecord = Record<string, unknown>;

export class IikoDirectoryService {
  constructor(private readonly client: IikoHttpClient) {}

  async syncOrganizations() {
    const data = await this.client.post<{ organizations?: IikoOrganization[] }>(
      "/1/organizations",
      { returnAdditionalInfo: true, includeDisabled: true, returnExternalData: [] },
      "iiko.organizations"
    );

    const organizations = data.organizations ?? [];
    for (const org of organizations) {
      await prisma.organization.upsert({
        where: { iikoId: org.id },
        update: {
          name: org.name,
          country: org.country,
          restaurantAddress: org.restaurantAddress,
          currencyIsoName: org.currencyIsoName,
          isCloud: org.isCloud,
          defaultCallCenterPaymentTypeId: org.defaultCallCenterPaymentTypeId,
          rawData: org as Prisma.InputJsonObject
        },
        create: {
          iikoId: org.id,
          name: org.name,
          country: org.country,
          restaurantAddress: org.restaurantAddress,
          currencyIsoName: org.currencyIsoName,
          isCloud: org.isCloud,
          defaultCallCenterPaymentTypeId: org.defaultCallCenterPaymentTypeId,
          rawData: org as Prisma.InputJsonObject
        }
      });
    }
    return prisma.organization.findMany({ orderBy: { name: "asc" } });
  }

  async syncTerminalGroups(organizationIikoId = env.IIKO_ORGANIZATION_ID) {
    const organization = await this.requireOrganization(organizationIikoId);
    const data = await this.client.post<{ terminalGroups?: Array<{ organizationId: string; items?: JsonRecord[]; terminalGroups?: JsonRecord[] }> }>(
      "/1/terminal_groups",
      { organizationIds: [organization.iikoId], includeDisabled: true, returnExternalData: [] },
      "iiko.terminal_groups"
    );
    const groups = data.terminalGroups?.flatMap((entry) => entry.items ?? entry.terminalGroups ?? []) ?? [];
    for (const group of groups) {
      const iikoId = String(group.id);
      await prisma.terminalGroup.upsert({
        where: { iikoId },
        update: {
          organizationId: organization.id,
          name: String(group.name ?? "Без названия"),
          address: typeof group.address === "string" ? group.address : undefined,
          disabled: Boolean(group.isDeleted ?? group.disabled ?? false),
          rawData: group as Prisma.InputJsonObject
        },
        create: {
          iikoId,
          organizationId: organization.id,
          name: String(group.name ?? "Без названия"),
          address: typeof group.address === "string" ? group.address : undefined,
          disabled: Boolean(group.isDeleted ?? group.disabled ?? false),
          rawData: group as Prisma.InputJsonObject
        }
      });
    }
    return prisma.terminalGroup.findMany({ where: { organizationId: organization.id }, orderBy: { name: "asc" } });
  }

  async syncOrderTypes(organizationIikoId = env.IIKO_ORGANIZATION_ID) {
    const organization = await this.requireOrganization(organizationIikoId);
    const data = await this.client.post<{ orderTypes?: JsonRecord[] }>("/1/deliveries/order_types", { organizationIds: [organization.iikoId] }, "iiko.order_types");
    for (const item of data.orderTypes ?? []) {
      await prisma.orderType.upsert({
        where: { iikoId: String(item.id) },
        update: {
          organizationId: organization.id,
          name: String(item.name ?? "Без названия"),
          orderServiceType: typeof item.orderServiceType === "string" ? item.orderServiceType : undefined,
          isDeleted: Boolean(item.isDeleted ?? false),
          rawData: item as Prisma.InputJsonObject
        },
        create: {
          iikoId: String(item.id),
          organizationId: organization.id,
          name: String(item.name ?? "Без названия"),
          orderServiceType: typeof item.orderServiceType === "string" ? item.orderServiceType : undefined,
          isDeleted: Boolean(item.isDeleted ?? false),
          rawData: item as Prisma.InputJsonObject
        }
      });
    }
    return prisma.orderType.findMany({ where: { organizationId: organization.id, isDeleted: false }, orderBy: { name: "asc" } });
  }

  async syncPaymentTypes(organizationIikoId = env.IIKO_ORGANIZATION_ID) {
    const organization = await this.requireOrganization(organizationIikoId);
    const data = await this.client.post<{ paymentTypes?: JsonRecord[] }>("/1/payment_types", { organizationIds: [organization.iikoId] }, "iiko.payment_types");
    for (const item of data.paymentTypes ?? []) {
      await prisma.paymentType.upsert({
        where: { iikoId: String(item.id) },
        update: {
          organizationId: organization.id,
          name: String(item.name ?? "Без названия"),
          kind: String(item.paymentTypeKind ?? item.kind ?? ""),
          code: typeof item.code === "string" ? item.code : undefined,
          isDeleted: Boolean(item.isDeleted ?? false),
          rawData: item as Prisma.InputJsonObject
        },
        create: {
          iikoId: String(item.id),
          organizationId: organization.id,
          name: String(item.name ?? "Без названия"),
          kind: String(item.paymentTypeKind ?? item.kind ?? ""),
          code: typeof item.code === "string" ? item.code : undefined,
          isDeleted: Boolean(item.isDeleted ?? false),
          rawData: item as Prisma.InputJsonObject
        }
      });
    }
    return prisma.paymentType.findMany({ where: { organizationId: organization.id, isDeleted: false }, orderBy: { name: "asc" } });
  }

  private async requireOrganization(iikoId: string) {
    let organization = iikoId ? await prisma.organization.findUnique({ where: { iikoId } }) : null;
    if (!organization) {
      await this.syncOrganizations();
      organization = iikoId ? await prisma.organization.findUnique({ where: { iikoId } }) : await prisma.organization.findFirst();
    }
    if (!organization) {
      throw new Error("Organization is not synchronized");
    }
    return organization;
  }
}
