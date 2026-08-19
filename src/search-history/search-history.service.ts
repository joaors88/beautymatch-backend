import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/modules/prisma/prisma.service';
import { CreateSearchHistoryDto } from './dto/create-search-history.dto';

@Injectable()
export class SearchHistoryService {
    constructor(
        private readonly prisma: PrismaService,
    ) {}

    async create(
    userId: string,
    dto: CreateSearchHistoryDto,
) {
    return this.prisma.searchHistory.create({
        data: {
            query: dto.query,
            userId
        }
    })
    }

    async findAllByUserId(userId: string) {
        return this.prisma.searchHistory.findMany({
            where: {
                userId,
            },
            orderBy: {
                createdAt: 'desc',
            }
        })
    }

}


