/*
  Warnings:

  - You are about to drop the column `photo_url` on the `listing` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "listing" DROP COLUMN "photo_url",
ADD COLUMN     "photo_urls" TEXT[],
ADD COLUMN     "video_urls" TEXT[];
