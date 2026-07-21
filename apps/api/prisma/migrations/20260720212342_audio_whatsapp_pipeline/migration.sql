-- CreateEnum
CREATE TYPE "InputModality" AS ENUM ('TEXT', 'AUDIO');

-- AlterEnum
ALTER TYPE "MessageEventType" ADD VALUE 'AUDIO';

-- AlterTable
ALTER TABLE "agent_executions" ADD COLUMN     "input_modality" "InputModality" NOT NULL DEFAULT 'TEXT';
