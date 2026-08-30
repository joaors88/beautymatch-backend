-- CreateEnum
CREATE TYPE "TrendDirection" AS ENUM ('RISING', 'STABLE', 'FALLING');

-- CreateTable
CREATE TABLE "TrendScore" (
    "id" TEXT NOT NULL,
    "term" VARCHAR(120) NOT NULL,
    "category" "ProductCategory" NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "direction" "TrendDirection" NOT NULL,
    "internalWeight" DOUBLE PRECISION NOT NULL,
    "externalWeight" DOUBLE PRECISION NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrendScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrendScore_computedAt_category_idx" ON "TrendScore"("computedAt", "category");

-- CreateIndex
CREATE INDEX "TrendScore_term_computedAt_idx" ON "TrendScore"("term", "computedAt");
