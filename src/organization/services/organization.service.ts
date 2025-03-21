import { Injectable } from "@nestjs/common";
import { plainToClass, plainToInstance } from "class-transformer";

import { AppLogger } from "../../shared/logger/logger.service";
import { RequestContext } from "../../shared/request-context/request-context.dto";
import { PrismaService } from "../../shared/prisma-module/prisma.service";
import {
  CreateOrganizationDto,
  OrganizationResponseDto,
  OrganizationSearchInput,
} from "../dto/organization.dto";
import { applyFilters } from "../../shared/filters/prisma-filter.filter";
import { Prisma } from "@prisma/client";
import { createSearchKey } from "../../shared/utils/createSearchKey";

@Injectable()
export class OrganizationService {
  constructor(
    private readonly logger: AppLogger,
    private readonly prismaService: PrismaService
  ) {
    this.logger.setContext(OrganizationService.name);
  }

  async getOrganizations(
    ctx: RequestContext,
    query: OrganizationSearchInput
  ): Promise<{ organizations: OrganizationResponseDto[]; count: number }> {
    this.logger.log(ctx, `${this.getOrganizations.name} was called`);
    const { limit, offset, ...restQuery } = query;

    const { whereBuilder: orgWhereQuery } =
      await applyFilters<Prisma.OrganizationsWhereInput>({
        appliedFiltersInput: restQuery,
        availableFilters: {
          name: async ({ filter }) => {
            const searchKey = createSearchKey(String(filter), "AND");
            return {
              where: {
                OR: [
                  {
                    name: {
                      search: searchKey,
                      mode: "insensitive",
                    },
                  },
                  {
                    name: {
                      contains: String(filter),
                      mode: "insensitive",
                    },
                  },
                ],
              },
            };
          },
        },
      });

    const organizations = await this.prismaService.organizations.findMany({
      where: {
        AND: [orgWhereQuery],
      },
      take: limit,
      skip: offset,
      orderBy: {
        createdAt: "desc",
      },
    });
    const organizationCount = await this.prismaService.organizations.count({
      where: {
        AND: [orgWhereQuery],
      },
    });

    return {
      organizations: plainToInstance(OrganizationResponseDto, organizations, {
        excludeExtraneousValues: true,
      }),
      count: organizationCount,
    };
  }

  async addOrganization(
    ctx: RequestContext,
    payload: CreateOrganizationDto
  ): Promise<OrganizationResponseDto> {
    this.logger.log(ctx, `${this.addOrganization.name} was called`);
    const organization = await this.prismaService.organizations.create({
      data: {
        ...payload,
      },
    });

    return plainToClass(OrganizationResponseDto, organization, {
      excludeExtraneousValues: true,
    });
  }
}
