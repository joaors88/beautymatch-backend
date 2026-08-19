import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { SearchHistoryService } from './search-history.service';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { CreateSearchHistoryDto } from './dto/create-search-history.dto';

import type { Request } from 'express';

@Controller('search-history')
export class SearchHistoryController {
    constructor(
        private readonly searchHistoryService: SearchHistoryService,
    ) {}

    @UseGuards(JwtAuthGuard)
    @Post()
    create(
        @Req() req: Request,
        @Body() dto: CreateSearchHistoryDto,
    ) {
        const userId = (req.user as any).userId

        return this.searchHistoryService.create(userId, dto)
    }

    @UseGuards(JwtAuthGuard)
    @Get()
    findAll(
        @Req() req: Request,
    ) {
        const userId = (req.user as any).userId

        return this.searchHistoryService.findAllByUserId(userId)
    }
}
