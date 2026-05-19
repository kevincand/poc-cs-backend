-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('PENDENTE', 'ANALISADO', 'CONFERIDO');

-- CreateTable
CREATE TABLE "AnalysisStatusControl" (
    "id" TEXT NOT NULL,
    "analysisUuid" TEXT NOT NULL,
    "status" "AnalysisStatus" NOT NULL DEFAULT 'PENDENTE',
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalysisStatusControl_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisStatusControl_analysisUuid_key" ON "AnalysisStatusControl"("analysisUuid");
