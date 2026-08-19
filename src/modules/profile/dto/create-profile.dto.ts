import {
  IsBoolean,
  IsEnum,
  IsOptional,
} from 'class-validator'

import {
  SkinType,
  HairType,
  BudgetRange,
  AgeRange,
  Gender,
} from '@prisma/client'

export class CreateProfileDto {
  @IsOptional()
  @IsEnum(SkinType)
  skinType?: SkinType

  @IsOptional()
  @IsEnum(HairType)
  hairType?: HairType

  @IsOptional()
  @IsEnum(BudgetRange)
  budget?: BudgetRange

  @IsOptional()
  @IsEnum(AgeRange)
  ageRange?: AgeRange

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender

  @IsOptional()
  @IsBoolean()
  sensitiveSkin?: boolean

  @IsOptional()
  @IsBoolean()
  veganOnly?: boolean
}