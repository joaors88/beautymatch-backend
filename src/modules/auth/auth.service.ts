import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { RegisterDto } from '../users/dto/register.dto';
import * as bcrypt from 'bcrypt'
import { JwtService } from '@nestjs/jwt';
import { LoginDto } from '../users/dto/login.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {

    constructor(
        private jwtService: JwtService, 
        private usersService: UsersService,
        private prisma: PrismaService
    ) {}

    async register(data: RegisterDto) {
        
        const userExists = await this.usersService.FindByEmail(data.email)

        if (userExists) {
            throw new BadRequestException('Email already exists');
        }

        const hashedPassword = await bcrypt.hash(data.password, 10);

        const user = await this.usersService.create({
            ...data,
            password: hashedPassword,
        })

        await this.prisma.usage.create({
            data: {
                userId: user.id,
                resetAt: new Date()
            }
        })

        return {
            id: user.id,
            name: user.name,
            email: user.email,
            createdAt: user.createdAt,
        }
    }

    async login(data: LoginDto) {

        const user = await this.usersService.FindByEmail(data.email)

        if (!user) {
            throw new UnauthorizedException('invalid credentials')
        }

        const passwordMatch = await bcrypt.compare(
            data.password,
            user.password,
        )

        if (!passwordMatch) {
            throw new UnauthorizedException('invalid credentials')
        }

        const payload = {
            sub: user.id,
            email: user.email,
        }

        const access_token = await this.jwtService.signAsync(payload)

        return {
            access_token
        }
    }

}
