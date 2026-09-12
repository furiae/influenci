-- AlterTable
ALTER TABLE "BenchmarkPost" ADD COLUMN     "analysis" JSONB,
ADD COLUMN     "analyzedAt" TIMESTAMP(3);

