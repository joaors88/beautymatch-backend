import { Module } from '@nestjs/common'
import { AiModule } from '../ai/ai.module'
import { searchModule } from '../search/search.module'
import { TrendsCollectorService } from './trends-collector.service'
import { TrendsCalculatorService } from './trends-calculator.service'
import { TrendsService } from './trends.service'
import { TrendsScheduler } from './trends.scheduler'
import { TrendsController } from './trends.controller'

@Module({
    imports: [AiModule, searchModule],
    providers: [TrendsCollectorService, TrendsCalculatorService, TrendsService, TrendsScheduler],
    controllers: [TrendsController],
    exports: [TrendsCollectorService, TrendsCalculatorService, TrendsService],
})
export class TrendsModule {}
