-- CreateEnum
CREATE TYPE "SpectrumStatus" AS ENUM ('OK', 'WARNING', 'MOTOR_STOPPED', 'BAD_SPECTRUM');

-- AlterTable
ALTER TABLE "AnalysisStatusControl" ADD COLUMN     "spectrumScore" INTEGER,
ADD COLUMN     "spectrumStatus" "SpectrumStatus";
