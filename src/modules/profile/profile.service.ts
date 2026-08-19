import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProfileDto } from './dto/create-profile.dto';

@Injectable()
export class ProfileService {
    constructor(
        private readonly prisma: PrismaService
    ) {}

    async create(userId: string, dto: CreateProfileDto) {
    return this.prisma.userProfile.upsert({
        where: {
            userId,
        },
        update: {
            ...dto,
        },
        create: {
            ...dto,
            userId,
        },
    })
}

    async findByUserId(userId: string) {
        return this.prisma.userProfile.findUnique({
            where: {
                userId,
            }
        })
    }

    async findUserWithProfile(userId: string) {
        return this.prisma.user.findUnique({
            where: {
                id: userId,
            },
            include: {
                profile: true
            }
        })
    }
}
