/*
  Warnings:

  - Added the required column `summary` to the `modules` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "courses" ALTER COLUMN "workloadHours" DROP NOT NULL;

-- AlterTable
ALTER TABLE "modules" ADD COLUMN     "summary" TEXT NOT NULL;
