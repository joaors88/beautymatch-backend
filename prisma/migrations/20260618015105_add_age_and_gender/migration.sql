-- CreateEnum
CREATE TYPE "AgeRange" AS ENUM ('TEEN', 'YOUNG_ADULT', 'ADULT', 'MATURE');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY');

-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN     "ageRange" "AgeRange",
ADD COLUMN     "gender" "Gender";
