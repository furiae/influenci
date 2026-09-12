import { sleep, FatalError, RetryableError } from "workflow";
import { prisma } from "@/lib/prisma";
import { getConnector } from "@/lib/social";
import { getFreshToken } from "@/lib/social/tokens";
import { validateForPlatform } from "@/lib/social/validate";
import { PublishError } from "@/lib/social/contract";
import { recomputePostStatus, logEvent } from "@/lib/scheduler/status";

/**
 * Publish one PostTarget through its platform connector. The target must
 * already be claimed (status "publishing") by the publisher; every step
 * re-reads the row so replays never double-post.
 */
export async function publishTargetWorkflow(targetId) {
  "use workflow";
  const prep = await prepareTarget(targetId);
  if (!prep.ok) return await finishTarget(targetId, { status: "failed", error: prep.error });

  const first = await publishTarget(targetId);
  let state = first;
  for (let i = 0; i < 40 && state.pending; i++) {
    await sleep("30s");
    state = await checkTarget(targetId);
  }
  if (state.pending) return await finishTarget(targetId, { status: "failed", error: "Still processing after 20 minutes; the poller will keep checking." , keepPublishing: true });
  return await finishTarget(targetId, state);
}

function wrap(err) {
  if (err instanceof PublishError) return err.retryable ? new RetryableError(err.message, { retryAfter: "45s" }) : new FatalError(err.message);
  return err;
}

async function load(targetId) {
  const target = await prisma.postTarget.findUnique({ where: { id: targetId }, include: { post: { include: { actor: true } }, channel: true } });
  if (!target) throw new FatalError(`Target ${targetId} not found`);
  return target;
}

async function prepareTarget(targetId) {
  "use step";
  const t = await load(targetId);
  if (t.status === "published") return { ok: false, error: "already published" };
  if (t.status !== "publishing") return { ok: false, error: `unexpected status ${t.status}` };
  const post = t.post;
  const channel = t.channel || (await prisma.channel.findFirst({ where: { actorId: post.actorId, platform: t.platform, status: { in: ["connected", "expiring"] } } }));
  if (!channel) return { ok: false, error: `No connected ${t.platform} channel for ${post.actor.name}` };
  const connector = getConnector(t.platform);
  if (!connector) return { ok: false, error: `${t.platform} connector not available` };
  const media = post.mediaType === "image" ? post.keyframeUrl : post.videoUrl;
  if (!media) return { ok: false, error: "post has no rendered media" };
  const problems = validateForPlatform(t.platform, { mediaType: post.mediaType, videoMeta: post.videoMeta || {} });
  if (problems.length) return { ok: false, error: problems.join("; ") };
  if (post.mediaType === "image" && !connector.publishImage) return { ok: false, error: `${connector.label} connector cannot post still images` };
  await prisma.postTarget.update({ where: { id: targetId }, data: { channelId: channel.id, attempts: { increment: 1 }, lockedAt: new Date(), error: null } });
  console.log("[PUBLISH] prepare", targetId, t.platform, post.actor.name);
  return { ok: true };
}

async function publishTarget(targetId) {
  "use step";
  const t = await load(targetId);
  if (t.externalId) return { pending: false, externalId: t.externalId, url: t.url, status: "published" }; // replay safety
  if (t.providerState?.externalId) return { pending: true, externalId: t.providerState.externalId };
  const connector = getConnector(t.platform);
  const channel = t.channel;
  try {
    const token = await getFreshToken(channel, connector);
    const post = t.post;
    const args = { channel, token, target: t, post, videoMeta: post.videoMeta || {}, coverUrl: post.keyframeUrl };
    const res = post.mediaType === "image"
      ? await connector.publishImage({ ...args, imageUrl: post.keyframeUrl })
      : await connector.publishVideo({ ...args, videoUrl: post.videoUrl });
    await prisma.postTarget.update({
      where: { id: targetId },
      data: { providerState: { ...(t.providerState || {}), ...(res.providerState || {}), externalId: res.externalId }, ...(res.pending ? {} : { externalId: res.externalId, url: res.url || null }) },
    });
    await logEvent({ postId: t.postId, actorId: t.post.actorId, kind: "publish", step: `${t.platform}_submit`, message: res.externalId, data: { pending: res.pending, url: res.url } });
    console.log("[PUBLISH] submitted", targetId, t.platform, res.externalId, res.pending ? "pending" : "done");
    return { pending: Boolean(res.pending), externalId: res.externalId, url: res.url || null, status: res.pending ? "processing" : "published" };
  } catch (err) {
    await logEvent({ postId: t.postId, actorId: t.post.actorId, kind: "publish", step: `${t.platform}_submit`, status: "failed", message: String(err?.message || err) });
    throw wrap(err);
  }
}
publishTarget.maxRetries = 2;

async function checkTarget(targetId) {
  "use step";
  const t = await load(targetId);
  const connector = getConnector(t.platform);
  try {
    const token = await getFreshToken(t.channel, connector);
    const r = await connector.fetchStatus({ channel: t.channel, token, target: { ...t, externalId: t.externalId || t.providerState?.externalId } });
    if (r.status === "published") return { pending: false, status: "published", externalId: r.externalId || t.providerState?.externalId, url: r.url || t.url };
    if (r.status === "failed") return { pending: false, status: "failed", error: r.error };
    return { pending: true };
  } catch (err) {
    throw wrap(err);
  }
}
checkTarget.maxRetries = 5;

async function finishTarget(targetId, result) {
  "use step";
  const t = await load(targetId);
  if (result.status === "published") {
    await prisma.postTarget.update({ where: { id: targetId }, data: { status: "published", externalId: result.externalId || t.externalId, url: result.url || t.url, publishedAt: new Date(), error: null, lockedAt: null } });
    await prisma.channel.update({ where: { id: t.channelId }, data: { lastPublishedAt: new Date() } }).catch(() => {});
    await logEvent({ postId: t.postId, actorId: t.post.actorId, kind: "publish", step: `${t.platform}_done`, message: result.url || result.externalId });
  } else if (result.keepPublishing) {
    await prisma.postTarget.update({ where: { id: targetId }, data: { error: result.error } });
  } else {
    await prisma.postTarget.update({ where: { id: targetId }, data: { status: "failed", error: String(result.error || "publish failed").slice(0, 1000), lockedAt: null } });
    await logEvent({ postId: t.postId, actorId: t.post.actorId, kind: "publish", step: `${t.platform}_failed`, status: "failed", message: String(result.error || "") });
  }
  const postStatus = await recomputePostStatus(t.postId);
  console.log("[PUBLISH] finish", targetId, t.platform, result.status, "post:", postStatus);
  return { targetId, status: result.status };
}
