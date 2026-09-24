-- AlterTable
ALTER TABLE "setting" ADD COLUMN     "updated_by" UUID;

-- AddForeignKey
ALTER TABLE "setting" ADD CONSTRAINT "setting_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
