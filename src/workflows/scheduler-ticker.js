import { sleep } from "workflow";
import { start } from "workflow/api";
import { prisma } from "@/lib/prisma";

const INTERVAL = "15m";
const MAX_ITERATIONS = 500; // then hand off to a fresh run to keep replay short

/**
 * Durable scheduler loop for the free Vercel plan (Hobby cron is once a day).
 * Every 15 minutes: planner (once a day), publisher, poller. Exits when the
 * AppSetting flag is switched off; re-spawns itself after MAX_ITERATIONS.
 */
export async function schedulerTickerWorkflow() {
  "use workflow";
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const keepGoing = await tick(i);
    if (!keepGoing) return { stopped: true, iterations: i + 1 };
    await sleep(INTERVAL);
  }
  const next = await respawn();
  return { respawned: next };
}

async function tick(i) {
  "use step";
  const { getTickerState, tickOnce } = await import("@/lib/scheduler/ticker");
  const state = await getTickerState();
  if (!state.enabled) {
    console.log("[TICKER] disabled; exiting");
    return false;
  }
  try {
    const summary = await tickOnce();
    const started = (summary.publisher || []).filter((r) => r.started).length;
    console.log("[TICKER] tick", i, "published-started:", started, summary.planner ? `planner: ${summary.planner.length} actor-days` : "");
    await prisma.pipelineEvent.create({ data: { kind: "scheduler", step: "tick", status: "ok", message: `started ${started}`, data: summary } });
  } catch (err) {
    console.error("[TICKER] tick error", err);
    await prisma.pipelineEvent.create({ data: { kind: "scheduler", step: "tick", status: "failed", message: String(err?.message || err).slice(0, 500) } });
  }
  return true;
}
tick.maxRetries = 0;

async function respawn() {
  "use step";
  const run = await start(schedulerTickerWorkflow, []);
  await prisma.appSetting.update({ where: { key: "scheduler.ticker" }, data: { value: { enabled: true, runId: run.runId, respawnedAt: new Date().toISOString() } } }).catch(() => {});
  console.log("[TICKER] respawned", run.runId);
  return run.runId;
}
