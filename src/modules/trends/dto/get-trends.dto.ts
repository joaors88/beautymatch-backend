import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator'
import { Type } from 'class-transformer'
import { ProductCategory } from '@prisma/client'

export class GetTrendsDto {
    @IsOptional()
    @IsEnum(ProductCategory)
    category?: ProductCategory

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(50)
    limit?: number
}
