import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';

import type { Request } from 'express';

import { ProfileService } from './profile.service';
import { CreateProfileDto } from './dto/create-profile.dto';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('profile')
export class ProfileController {
    constructor(
        private readonly profileService: ProfileService,
    ) {}

    @UseGuards(JwtAuthGuard)
    @Post()
    create(
        @Req() req: Request,
        @Body() dto: CreateProfileDto,
    ) {
        const userId = (req.user as any).userId

        return this.profileService.create(userId, dto)
    }

    @UseGuards(JwtAuthGuard)
    @Get('me')
    getMyProfile(
        @Req() req: Request,
    ) {
        const userId = (req.user as any).userId

        return this.profileService.findByUserId(userId)
    }

    @UseGuards(JwtAuthGuard)
    @Get('user')
    getUserWithProfile(
        @Req() req: Request,
    ) {
        const userId = (req.user as any).userId

        return this.profileService.findUserWithProfile(userId)
}
}
