-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "quality_grade" ADD VALUE 'small';
ALTER TYPE "quality_grade" ADD VALUE 'bold';
ALTER TYPE "quality_grade" ADD VALUE 'normal';
ALTER TYPE "quality_grade" ADD VALUE 'dry';
ALTER TYPE "quality_grade" ADD VALUE 'full_green';
ALTER TYPE "quality_grade" ADD VALUE 'medium';
ALTER TYPE "quality_grade" ADD VALUE 'standard';
ALTER TYPE "quality_grade" ADD VALUE 'madras';
ALTER TYPE "quality_grade" ADD VALUE 'imported';
ALTER TYPE "quality_grade" ADD VALUE 'stream';
ALTER TYPE "quality_grade" ADD VALUE 'sella';
ALTER TYPE "quality_grade" ADD VALUE 'parmal';
