import { Module } from '@nestjs/common';
import { SearchHistoryService } from './search-history.service';
import { SearchHistoryController } from './search-history.controller';

@Module({
  providers: [SearchHistoryService],
  controllers: [SearchHistoryController]
})
export class SearchHistoryModule {}
