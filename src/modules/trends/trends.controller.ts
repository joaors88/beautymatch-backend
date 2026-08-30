import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { TrendsCollectorService } from './trends-collector.service'
import { TrendsCalculatorService } from './trends-calculator.service'
import { TrendsService } from './trends.service'
import { GetTrendsDto } from './dto/get-trends.dto'

@Controller('trends')
export class TrendsController {
    constructor(
        private readonly collector: TrendsCollectorService,
        private readonly calculator: TrendsCalculatorService,
        private readonly trends: TrendsService,
    ) {}

    /** O que a tela de tendências consome. */
    @UseGuards(JwtAuthGuard)
    @Get()
    list(@Query() query: GetTrendsDto) {
        return this.trends.getTrends(query.category, query.limit)
    }

    /**
     * Gatilhos manuais, para não ter que esperar o cron diário durante o
     * desenvolvimento. /collect consome cota do Serper a cada chamada — antes de
     * ir para produção, restringir a admin ou remover.
     */
    @UseGuards(JwtAuthGuard)
    @Post('collect')
    collect() {
        return this.collector.collect()
    }

    @UseGuards(JwtAuthGuard)
    @Post('calculate')
    calculate() {
        return this.calculator.calculate()
    }
}
