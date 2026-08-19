import { Module } from '@nestjs/common';
import { PrismaModule } from './modules/prisma/prisma.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { ProfileModule } from './modules/profile/profile.module';
import { SearchHistoryModule } from './search-history/search-history.module';
import { UsageService } from './usage/usage.service';
import { ChatModule } from './chat/chat.module';
import { UsageModule } from './usage/usage.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, UsersModule, AuthModule, ProfileModule, SearchHistoryModule, ChatModule, UsageModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
