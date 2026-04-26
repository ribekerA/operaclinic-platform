-- CreateEnum
CREATE TYPE "HandoffPriority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- AlterTable
ALTER TABLE "handoff_requests" ADD COLUMN     "priority" "HandoffPriority" NOT NULL DEFAULT 'MEDIUM';
