-- DropForeignKey
ALTER TABLE "ChannelPost" DROP CONSTRAINT "ChannelPost_channelId_fkey";

-- DropIndex
DROP INDEX "ChannelPost_channelId_externalId_key";

-- AlterTable
ALTER TABLE "ChannelPost" ALTER COLUMN "channelId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ChannelPost_actorId_platform_externalId_key" ON "ChannelPost"("actorId", "platform", "externalId");

-- AddForeignKey
ALTER TABLE "ChannelPost" ADD CONSTRAINT "ChannelPost_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
