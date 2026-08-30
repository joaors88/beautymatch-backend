-- CreateEnum
CREATE TYPE "TrendSource" AS ENUM ('AUTOCOMPLETE');

-- CreateTable
CREATE TABLE "TrendSnapshot" (
    "id" TEXT NOT NULL,
    "term" VARCHAR(120) NOT NULL,
    "category" "ProductCategory" NOT NULL,
    "source" "TrendSource" NOT NULL,
    "position" INTEGER NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrendSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrendSnapshot_term_capturedAt_idx" ON "TrendSnapshot"("term", "capturedAt");

-- CreateIndex
CREATE INDEX "TrendSnapshot_category_capturedAt_idx" ON "TrendSnapshot"("category", "capturedAt");
