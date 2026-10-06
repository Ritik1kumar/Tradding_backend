/*
  Warnings:

  - The `default_payment_terms` column on the `app_user` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `payment_terms` column on the `listing` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "app_user" DROP COLUMN "default_payment_terms",
ADD COLUMN     "default_payment_terms" INTEGER;

-- AlterTable
ALTER TABLE "listing" DROP COLUMN "payment_terms",
ADD COLUMN     "payment_terms" INTEGER;
