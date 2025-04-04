import { Injectable, NotFoundException } from "@nestjs/common";
import { plainToClass, plainToInstance } from "class-transformer";

import { AppLogger } from "../../shared/logger/logger.service";
import { RequestContext } from "../../shared/request-context/request-context.dto";
import { PrismaService } from "../../shared/prisma-module/prisma.service";
import {
  CreateOpportunityDto,
  OpportunityResponseDto,
  OpportunitySearchInput,
  UpdateOpportunityDto,
} from "../dto/opportunities.dto";
import { applyFilters } from "../../shared/filters/prisma-filter.filter";
import { Prisma } from "@prisma/client";
import { createSearchKey } from "../../shared/utils/createSearchKey";

@Injectable()
export class OpportunityService {
  constructor(
    private readonly logger: AppLogger,
    private readonly prismaService: PrismaService
  ) {
    this.logger.setContext(OpportunityService.name);
  }

  async getOpportunities(
    ctx: RequestContext,
    query: OpportunitySearchInput
  ): Promise<{ items: OpportunityResponseDto[]; count: number }> {
    this.logger.log(ctx, `${this.getOpportunities.name} was called`);
    const { limit, offset, ...restQuery } = query;

    const { whereBuilder: whereQuery } =
      await applyFilters<Prisma.OpportunityWhereInput>({
        appliedFiltersInput: restQuery,
        availableFilters: {
          title: async ({ filter }) => {
            const searchKey = createSearchKey(String(filter), "AND");
            return {
              where: {
                OR: [
                  {
                    title: {
                      search: searchKey,
                      mode: "insensitive",
                    },
                  },
                  {
                    title: {
                      contains: String(filter),
                      mode: "insensitive",
                    },
                  },
                ],
              },
            };
          },
          tagIds: async ({ filter }) => {
            return {
              where: {
                tags: {
                  some: {
                    id: {
                      in: filter as string[],
                    },
                  },
                },
              },
            };
          },
        },
      });

    const items = await this.prismaService.opportunity.findMany({
      where: {
        AND: [whereQuery],
      },
      include: {
        address: true,
        socials: true,
        tags: true,
      },
      take: limit,
      skip: offset,
      orderBy: {
        createdAt: "desc",
      },
    });

    const count = await this.prismaService.opportunity.count({
      where: {
        AND: [whereQuery],
      },
    });
    return {
      items: plainToInstance(OpportunityResponseDto, items, {
        excludeExtraneousValues: true,
      }),
      count: count,
    };
  }

  async getOneOpportunity(
    ctx: RequestContext,
    id: string
  ): Promise<OpportunityResponseDto> {
    this.logger.log(ctx, `${this.getOneOpportunity.name} was called`);

    const item = await this.prismaService.opportunity.findUnique({
      where: {
        id,
      },
      include: {
        address: true,
        socials: true,
        tags: true,
      },
    });

    if (!item) {
      throw new NotFoundException("Opportunity not found");
    }

    return plainToInstance(OpportunityResponseDto, item, {
      excludeExtraneousValues: true,
    });
  }

  async addOpportunity(
    ctx: RequestContext,
    payload: CreateOpportunityDto
  ): Promise<OpportunityResponseDto> {
    this.logger.log(ctx, `${this.addOpportunity.name} was called`);
    const { address, tagIds, socials, ...restPayload } = payload;
    const item = await this.prismaService.opportunity.create({
      data: {
        ...restPayload,
        ...(address && {
          address: {
            create: {
              ...address,
            },
          },
        }),
        ...(tagIds && {
          tags: {
            connect: tagIds?.map((id) => ({
              id,
              isOpportunityTag: true,
            })),
          },
        }),
        ...(socials && {
          socials: {
            create: {
              data: JSON.parse(JSON.stringify(socials)),
            },
          },
        }),
      },
    });

    return plainToClass(OpportunityResponseDto, item, {
      excludeExtraneousValues: true,
    });
  }

  async deleteOpportunity(
    ctx: RequestContext,
    id: string
  ): Promise<OpportunityResponseDto> {
    this.logger.log(ctx, `${this.deleteOpportunity.name} was called`);

    const item = await this.prismaService.opportunity.findUnique({
      where: {
        id,
      },
    });

    if (!item) {
      throw new NotFoundException("Opportunity not found");
    }

    await this.prismaService.opportunity.delete({
      where: {
        id: item.id,
      },
    });

    return plainToInstance(OpportunityResponseDto, item, {
      excludeExtraneousValues: true,
    });
  }

  async updateOpportunity(
    ctx: RequestContext,
    id: string,
    payload: UpdateOpportunityDto
  ): Promise<OpportunityResponseDto> {
    this.logger.log(ctx, `${this.updateOpportunity.name} was called`);
    const item = await this.prismaService.opportunity.findUnique({
      where: {
        id,
      },
    });
    if (!item) {
      throw new NotFoundException("Opportunity not found!");
    }

    const { address, tagIds, socials, ...restPayload } = payload;

    const updatedItem = await this.prismaService.opportunity.update({
      where: {
        id: item.id,
      },
      data: {
        ...restPayload,
        address: {
          upsert: {},
        },
        ...(socials && {
          socials: {
            upsert: {
              create: {
                data: JSON.parse(JSON.stringify(socials)),
              },
              update: {
                data: JSON.parse(JSON.stringify(socials)),
              },
            },
          },
        }),
        ...(address && {
          address: {
            upsert: {
              create: address,
              update: address,
            },
          },
        }),
        ...(tagIds && {
          tags: {
            //set empty then create new records
            // do not use deletemany here since it maybe used elsewhere
            set: [],
            connect: tagIds?.map((id) => ({
              id,
              isOpportunityTag: true,
            })),
          },
        }),
      },
    });

    return plainToClass(OpportunityResponseDto, updatedItem, {
      excludeExtraneousValues: true,
    });
  }
}
