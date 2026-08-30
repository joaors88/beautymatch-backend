-- CreateEnum
CREATE TYPE "ProductCategory" AS ENUM ('SKINCARE_FACIAL', 'CORPO', 'CABELO', 'MAQUIAGEM', 'PROTECAO_SOLAR', 'PERFUMARIA');

-- AlterTable
ALTER TABLE "SearchHistory" ADD COLUMN     "canonicalTerm" VARCHAR(120),
ADD COLUMN     "category" "ProductCategory";

-- CreateIndex
CREATE INDEX "SearchHistory_category_createdAt_idx" ON "SearchHistory"("category", "createdAt");

-- CreateIndex
CREATE INDEX "SearchHistory_canonicalTerm_createdAt_idx" ON "SearchHistory"("canonicalTerm", "createdAt");
