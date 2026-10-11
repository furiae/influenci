-- AlterTable
ALTER TABLE "Actor" ADD COLUMN     "brandProfile" JSONB,
ADD COLUMN     "designSystem" JSONB,
ADD COLUMN     "designSystemVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "insightsSummary" JSONB,
ADD COLUMN     "importStatus" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN     "importRunId" TEXT,
ADD COLUMN     "importError" TEXT,
ADD COLUMN     "lastImportAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Channel" ADD COLUMN     "followers" INTEGER,
ADD COLUMN     "following" INTEGER,
ADD COLUMN     "mediaCount" INTEGER,
ADD COLUMN     "lastSyncedAt" TIMESTAMP(3),
ADD COLUMN     "syncCursor" JSONB;

-- CreateTable
CREATE TABLE "ChannelPost" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "url" TEXT,
    "caption" TEXT,
    "mediaType" TEXT,
    "mediaUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "thumbnailUrl" TEXT,
    "postedAt" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'import',
    "postTargetId" TEXT,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "saves" INTEGER NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER,
    "impressions" INTEGER,
    "clicks" INTEGER,
    "videoAvgWatchSec" DOUBLE PRECISION,
    "reactionsByType" JSONB,
    "followersAtFetch" INTEGER,
    "engagementRate" DOUBLE PRECISION,
    "reachRate" DOUBLE PRECISION,
    "score" INTEGER,
    "scoreBreakdown" JSONB,
    "scoreVersion" INTEGER NOT NULL DEFAULT 0,
    "analysis" JSONB,
    "analyzedAt" TIMESTAMP(3),
    "topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "format" TEXT,
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "raw" JSONB,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metricsUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelPostMetric" (
    "id" TEXT NOT NULL,
    "channelPostId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "saves" INTEGER NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER,

    CONSTRAINT "ChannelPostMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelDailyInsight" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "followers" INTEGER,
    "newFollowers" INTEGER,
    "reach" INTEGER,
    "impressions" INTEGER,
    "profileViews" INTEGER,
    "websiteClicks" INTEGER,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChannelDailyInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "batchId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'suggested',
    "kind" TEXT NOT NULL DEFAULT 'post',
    "platforms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "format" TEXT,
    "title" TEXT NOT NULL,
    "concept" TEXT NOT NULL,
    "hook" TEXT,
    "caption" TEXT,
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "visualBrief" JSONB,
    "bestTime" JSONB,
    "predictedScore" INTEGER,
    "predictedReachLow" INTEGER,
    "predictedReachHigh" INTEGER,
    "predictedEngagementRate" DOUBLE PRECISION,
    "confidence" DOUBLE PRECISION,
    "rationale" TEXT,
    "basedOn" JSONB,
    "postId" TEXT,
    "actualScore" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChannelPost_postTargetId_key" ON "ChannelPost"("postTargetId");

-- CreateIndex
CREATE INDEX "ChannelPost_actorId_postedAt_idx" ON "ChannelPost"("actorId", "postedAt");

-- CreateIndex
CREATE INDEX "ChannelPost_actorId_score_idx" ON "ChannelPost"("actorId", "score");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelPost_channelId_externalId_key" ON "ChannelPost"("channelId", "externalId");

-- CreateIndex
CREATE INDEX "ChannelPostMetric_channelPostId_capturedAt_idx" ON "ChannelPostMetric"("channelPostId", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelDailyInsight_channelId_date_key" ON "ChannelDailyInsight"("channelId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Recommendation_postId_key" ON "Recommendation"("postId");

-- CreateIndex
CREATE INDEX "Recommendation_actorId_status_createdAt_idx" ON "Recommendation"("actorId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "ChannelPost" ADD CONSTRAINT "ChannelPost_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelPost" ADD CONSTRAINT "ChannelPost_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelPost" ADD CONSTRAINT "ChannelPost_postTargetId_fkey" FOREIGN KEY ("postTargetId") REFERENCES "PostTarget"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelPostMetric" ADD CONSTRAINT "ChannelPostMetric_channelPostId_fkey" FOREIGN KEY ("channelPostId") REFERENCES "ChannelPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelDailyInsight" ADD CONSTRAINT "ChannelDailyInsight_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;
