import { prisma } from "@/lib/prisma";

/** Derive Post.status from its targets once publishing has started. */
export async function recomputePostStatus(postId) {
  const post = await prisma.post.findUnique({ where: { id: postId }, include: { targets: true } });
  if (!post) return null;
  if (["draft", "planned", "rendering", "failed", "cancelled"].includes(post.status)) return post.status;
  const t = post.targets.filter((x) => !["skipped", "cancelled"].includes(x.status));
  if (!t.length) return post.status;
  const published = t.filter((x) => x.status === "published").length;
  const failed = t.filter((x) => x.status === "failed").length;
  const active = t.filter((x) => ["queued", "publishing", "pending"].includes(x.status)).length;
  let status = post.status;
  if (active === 0 && published === t.length) status = "published";
  else if (active === 0 && published > 0) status = "partial";
  else if (active === 0 && failed === t.length) status = "failed";
  else if (published > 0 || t.some((x) => x.status === "publishing")) status = "publishing";
  if (status !== post.status) await prisma.post.update({ where: { id: postId }, data: { status } });
  return status;
}

export async function logEvent({ postId = null, actorId = null, kind, step, status = "ok", message = null, costCents = 0, data = null }) {
  try {
    await prisma.pipelineEvent.create({ data: { postId, actorId, kind, step, status, message, costCents, data } });
    if (postId && costCents) await prisma.post.update({ where: { id: postId }, data: { costCents: { increment: costCents } } });
  } catch (err) {
    console.error("[PIPELINE_EVENT_ERROR]", err);
  }
}
