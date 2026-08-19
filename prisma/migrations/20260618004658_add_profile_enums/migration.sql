/*
  Warnings:

  - The `skinType` column on the `UserProfile` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `hairType` column on the `UserProfile` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `budget` column on the `UserProfile` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "SkinType" AS ENUM ('OILY', 'DRY', 'COMBINATION', 'SENSITIVE');

-- CreateEnum
CREATE TYPE "HairType" AS ENUM ('STRAIGHT', 'WAVY', 'CURLY', 'COILY');

-- CreateEnum
CREATE TYPE "BudgetRange" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- AlterTable
ALTER TABLE "UserProfile" DROP COLUMN "skinType",
ADD COLUMN     "skinType" "SkinType",
DROP COLUMN "hairType",
ADD COLUMN     "hairType" "HairType",
DROP COLUMN "budget",
ADD COLUMN     "budget" "BudgetRange";
