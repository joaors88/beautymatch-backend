import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/modules/prisma/prisma.service';

@Injectable() export class UsageService {
    constructor(
        private readonly prisma: PrismaService
    ) {}

    async getByUserId(userId: string) {
        return this.prisma.usage.findUnique({
            where: { userId },
        })
    }

    async canUseChat(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId }
        })

        if (!user) return false

        if (user.plan === 'PREMIUM') return true

        const usage = await this.getByUserId(userId)

        if (!usage) return false

        return usage.questionsUsed < 5
    }

    async increment(userId: string) {
        return this.prisma.usage.update({
            where: { userId },
            data: {
                questionsUsed: {
                    increment: 1
                }
            }
        })
    }
}
