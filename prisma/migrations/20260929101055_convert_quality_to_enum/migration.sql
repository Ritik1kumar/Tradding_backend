/*
  Warnings:

  - The `quality` column on the `listing` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "quality_grade" AS ENUM ('barik', 'chota', 'mota', 'dardra');

-- AlterTable
ALTER TABLE "listing" DROP COLUMN "quality",
ADD COLUMN     "quality" "quality_grade";

-- Partial unique index: prevent duplicate SELL listings for the same seller/category/
-- commodity/weight/quality combo among "live" rows (active/na/price_expired). Withdrawn
-- and traded rows are excluded so re-listing the same combo after withdrawal is allowed.
CREATE UNIQUE INDEX "uq_listing_no_duplicate_sell"
ON "listing" ("user_id", "category_id", "commodity_id", "weight_kg", "quality")
NULLS NOT DISTINCT
WHERE "side" = 'SELL' AND "status" IN ('active', 'na', 'price_expired');
