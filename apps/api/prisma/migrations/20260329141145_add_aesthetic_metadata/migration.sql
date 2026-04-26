-- CreateEnum
CREATE TYPE "AestheticArea" AS ENUM ('FACIAL', 'CORPORAL', 'CAPILAR', 'LASER', 'HARMONIZACAO_OROFACIAL', 'PEELING', 'OUTRO');

-- CreateEnum
CREATE TYPE "InvasivenessLevel" AS ENUM ('NON_INVASIVE', 'MINIMALLY_INVASIVE', 'MODERATELY_INVASIVE', 'HIGHLY_INVASIVE', 'SURGICAL');

-- AlterTable
ALTER TABLE "consultation_types" ADD COLUMN     "aesthetic_area" "AestheticArea",
ADD COLUMN     "invasiveness_level" "InvasivenessLevel",
ADD COLUMN     "recommended_frequency_days" INTEGER,
ADD COLUMN     "recovery_days" INTEGER;
