-- AlterTable
ALTER TABLE "User" ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'member';

-- AlterTable
ALTER TABLE "Actor" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "autoPublish" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "bible" JSONB,
ADD COLUMN     "cadence" JSONB,
ADD COLUMN     "canonicalPrompt" TEXT,
ADD COLUMN     "datasetZipUrl" TEXT,
ADD COLUMN     "defaultClip" JSONB,
ADD COLUMN     "identityError" TEXT,
ADD COLUMN     "identityJobId" TEXT,
ADD COLUMN     "identityStatus" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'human',
ADD COLUMN     "klingElementId" TEXT,
ADD COLUMN     "loraTriggerWord" TEXT,
ADD COLUMN     "loraUrl" TEXT,
ADD COLUMN     "negativePrompt" TEXT,
ADD COLUMN     "referenceImages" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "slug" TEXT,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
ADD COLUMN     "videosPerDay" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "handle" TEXT,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "accessTokenEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "refreshExpiresAt" TIMESTAMP(3),
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'connected',
    "lastError" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "lastPublishedAt" TIMESTAMP(3),
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planDate" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "mediaType" TEXT NOT NULL DEFAULT 'video',
    "clipLengthSec" INTEGER NOT NULL DEFAULT 5,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "idea" TEXT,
    "pillar" TEXT,
    "hook" TEXT,
    "script" JSONB,
    "keyframeUrl" TEXT,
    "keyframeQa" JSONB,
    "creationId" TEXT,
    "videoUrl" TEXT,
    "videoMeta" JSONB,
    "renderRunId" TEXT,
    "renderError" TEXT,
    "costCents" INTEGER NOT NULL DEFAULT 0,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostTarget" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "slotIndex" INTEGER NOT NULL DEFAULT 0,
    "channelId" TEXT,
    "caption" TEXT,
    "title" TEXT,
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "settings" JSONB,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedAt" TIMESTAMP(3),
    "publishRunId" TEXT,
    "providerState" JSONB,
    "externalId" TEXT,
    "url" TEXT,
    "error" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformApp" (
    "platform" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecretEnc" TEXT NOT NULL,
    "extra" JSONB,
    "reviewStatus" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformApp_pkey" PRIMARY KEY ("platform")
);

-- CreateTable
CREATE TABLE "PipelineEvent" (
    "id" TEXT NOT NULL,
    "postId" TEXT,
    "actorId" TEXT,
    "kind" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "costCents" INTEGER NOT NULL DEFAULT 0,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PipelineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Channel_platform_status_idx" ON "Channel"("platform", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Channel_actorId_platform_key" ON "Channel"("actorId", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "Post_creationId_key" ON "Post"("creationId");

-- CreateIndex
CREATE INDEX "Post_userId_planDate_idx" ON "Post"("userId", "planDate");

-- CreateIndex
CREATE INDEX "Post_status_idx" ON "Post"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Post_actorId_planDate_sequence_key" ON "Post"("actorId", "planDate", "sequence");

-- CreateIndex
CREATE INDEX "PostTarget_status_scheduledAt_idx" ON "PostTarget"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "PostTarget_channelId_publishedAt_idx" ON "PostTarget"("channelId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PostTarget_postId_platform_slotIndex_key" ON "PostTarget"("postId", "platform", "slotIndex");

-- CreateIndex
CREATE INDEX "PipelineEvent_postId_createdAt_idx" ON "PipelineEvent"("postId", "createdAt");

-- CreateIndex
CREATE INDEX "PipelineEvent_actorId_createdAt_idx" ON "PipelineEvent"("actorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Actor_userId_slug_key" ON "Actor"("userId", "slug");

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_creationId_fkey" FOREIGN KEY ("creationId") REFERENCES "Creation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostTarget" ADD CONSTRAINT "PostTarget_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostTarget" ADD CONSTRAINT "PostTarget_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineEvent" ADD CONSTRAINT "PipelineEvent_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

