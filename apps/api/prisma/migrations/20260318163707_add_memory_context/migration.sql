-- AlterTable
ALTER TABLE "message_threads" ADD COLUMN     "last_intent" VARCHAR(80);

-- AlterTable
ALTER TABLE "patients" ADD COLUMN     "intent_history" JSONB;
