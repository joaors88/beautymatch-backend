import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { AiModule } from 'src/modules/ai/ai.module';
import { UsageModule } from 'src/usage/usage.module';
import { searchModule } from 'src/modules/search/search.module';
import { TrendsModule } from 'src/modules/trends/trends.module';



@Module({
  imports: [AiModule, UsageModule, searchModule, TrendsModule],
  providers: [ChatService],
  controllers: [ChatController]
})
export class ChatModule {}
