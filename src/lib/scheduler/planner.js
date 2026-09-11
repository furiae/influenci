import { prisma } from "@/lib/prisma";
import { start } from "workflow/api";
import { slotsForDay } from "./cadence";
import { planIdeas } from "@/lib/content/planner";
import { logEvent } from "./status";
import { renderPostWorkflow } from "@/workflows/render-post";
import { todayIn, addDays } from "@/lib/time";

/**
 * Create the day's Post rows (+ per-platform targets) for one actor and start
 * their render workflows. Idempotent: existing (actorId, planDate, sequence)
 * rows are left alone. Returns { created, skipped, postIds }.
 */
export async function planActorDay(actor, ymd, { videosPerDay } = {}) {
  const count = Math.max(0, Number(videosPerDay ?? actor.videosPerDay ?? 1));
  const slots = slotsForDay(actor, ymd);
  if (count === 0 || slots.length === 0) return { created: 0, skipped: 0, postIds: [] };

  const existing = await prisma.post.findMany({ where: { actorId: actor.id, planDate: ymd }, select: { id: true, sequence: true } });
  const have = new Set(existing.map((p) => p.sequence));
  const missing = Array.from({ length: count }, (_, i) => i).filter((i) => !have.has(i));
  if (!missing.length) return { created: 0, skipped: count, postIds: existing.map((p) => p.id) };

  const recent = await prisma.post.findMany({
    where: { actorId: actor.id, idea: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { idea: true },
  });
  const { ideas, costCents } = await planIdeas({ actor, date: ymd, count: missing.length, recent: recent.map((r) => r.idea) });
  await logEvent({ actorId: actor.id, kind: "plan", step: "ideas", costCents, message: `${ideas.length} ideas for ${ymd}` });

  const clip = actor.defaultClip && typeof actor.defaultClip === "object" ? actor.defaultClip : {};
  const mediaType = clip.mediaType === "image" ? "image" : "video";
  const clipLengthSec = clip.lengthSec === 10 ? 10 : 5;

  const postIds = [];
  let created = 0;
  for (let k = 0; k < missing.length; k++) {
    const sequence = missing[k];
    const idea = ideas[k] || ideas[ideas.length - 1];
    if (!idea) break;
    // Round-robin the day's slots across the day's posts.
    const mySlots = slots.filter((_, idx) => idx % count === sequence);
    try {
      const post = await prisma.post.create({
        data: {
          actorId: actor.id,
          userId: actor.userId,
          planDate: ymd,
          sequence,
          mediaType,
          clipLengthSec,
          status: "planned",
          idea: idea.idea,
          pillar: idea.pillar,
          hook: idea.hook,
          targets: {
            create: mySlots.map((s) => ({ platform: s.platform, slotIndex: s.slotIndex, scheduledAt: s.scheduledAt, status: "pending" })),
          },
        },
      });
      postIds.push(post.id);
      created += 1;
      const run = await start(renderPostWorkflow, [post.id]);
      await prisma.post.update({ where: { id: post.id }, data: { renderRunId: run.runId } });
    } catch (err) {
      if (err?.code === "P2002") continue; // planned concurrently
      throw err;
    }
  }
  return { created, skipped: count - created, postIds };
}

/** Plan tomorrow (and backfill today) for every active actor. */
export async function runPlanner({ userId = null, dayOffset = 1 } = {}) {
  const actors = await prisma.actor.findMany({ where: { active: true, ...(userId ? { userId } : {}) } });
  const results = [];
  for (const actor of actors) {
    if (!actor.imageUrl) continue;
    const today = todayIn(actor.timezone || "America/New_York");
    const days = [addDays(today, dayOffset)];
    if (dayOffset > 0) days.unshift(today);
    for (const ymd of days) {
      try {
        const r = await planActorDay(actor, ymd);
        results.push({ actor: actor.name, ymd, ...r });
      } catch (err) {
        console.error("[PLANNER_ERROR]", actor.name, ymd, err);
        await logEvent({ actorId: actor.id, kind: "plan", step: "day", status: "failed", message: String(err?.message || err) });
        results.push({ actor: actor.name, ymd, error: String(err?.message || err) });
      }
    }
  }
  return results;
}
