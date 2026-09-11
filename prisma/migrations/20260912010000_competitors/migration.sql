-- CreateTable
CREATE TABLE "Competitor" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "externalId" TEXT,
    "displayName" TEXT,
    "url" TEXT,
    "followers" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "lastFetchedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Competitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BenchmarkPost" (
    "id" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "url" TEXT,
    "caption" TEXT,
    "mediaType" TEXT,
    "thumbnailUrl" TEXT,
    "postedAt" TIMESTAMP(3),
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "durationSec" INTEGER,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BenchmarkPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Competitor_actorId_idx" ON "Competitor"("actorId");

-- CreateIndex
CREATE UNIQUE INDEX "Competitor_actorId_platform_handle_key" ON "Competitor"("actorId", "platform", "handle");

-- CreateIndex
CREATE INDEX "BenchmarkPost_competitorId_score_idx" ON "BenchmarkPost"("competitorId", "score");

-- CreateIndex
CREATE UNIQUE INDEX "BenchmarkPost_competitorId_externalId_key" ON "BenchmarkPost"("competitorId", "externalId");

-- AddForeignKey
ALTER TABLE "Competitor" ADD CONSTRAINT "Competitor_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenchmarkPost" ADD CONSTRAINT "BenchmarkPost_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

