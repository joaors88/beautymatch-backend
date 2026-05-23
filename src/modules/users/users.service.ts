import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {

    constructor(
        private prisma: PrismaService
    ) {}

    async create(data: CreateUserDto) {

        return this.prisma.user.create({
            data,
        })
    }

    async FindByEmail(email: string) {

        return this.prisma.user.findUnique({
            where: {
                email,
            }
        })
    }
}
