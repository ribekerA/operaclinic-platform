-- AlterEnum
-- IF NOT EXISTS is safe: value may already exist if a previous failed deploy
-- ran the statement but Prisma didn't record the migration (ADD VALUE is not
-- transactional in PostgreSQL — it persists even on a rolled-back transaction).
ALTER TYPE "IntegrationProvider" ADD VALUE IF NOT EXISTS 'WHATSAPP_EVOLUTION';
