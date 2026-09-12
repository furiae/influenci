import { prisma } from "@/lib/prisma";
import { start, getRun } from "workflow/api";
import { schedulerTickerWorkflow } from "@/workflows/scheduler-ticker";
import { runPlanner } from "./planner";
import { runPublisher } from "./publisher";
import { runPoller } from "./poller";

const KEY = "scheduler.ticker";
export const PLANNER_HOUR_UTC = 9; // 05:00 New York in summer, 04:00 in winter

export async function getTickerState() {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  return row?.value || { runId: null, enabled: false, lastTickAt: null, lastPlannerDate: null };
}

async function setTickerState(patch) {
  const current = await getTickerState();
  const value = { ...current, ...patch };
  await prisma.appSetting.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value } });
  return value;
}

/** One tick: planner once per UTC day after PLANNER_HOUR_UTC, publisher and poller every time. */
export async function tickOnce() {
  const now = new Date();
  const state = await getTickerState();
  const today = now.toISOString().slice(0, 10);
  const summary = { at: now.toISOString() };
  if (now.getUTCHours() >= PLANNER_HOUR_UTC && state.lastPlannerDate !== today) {
    summary.planner = await runPlanner({ dayOffset: 1 });
    await setTickerState({ lastPlannerDate: today });
  }
  summary.publisher = await runPublisher({ now });
  summary.poller = await runPoller({ now });
  await setTickerState({ lastTickAt: now.toISOString() });
  return summary;
}

/** Start the durable ticker unless one is already running. */
export async function startTicker() {
  const state = await getTickerState();
  if (state.runId) {
    try {
      const status = await getRun(state.runId).status;
      if (status === "running") return { ...state, alreadyRunning: true };
    } catch {}
  }
  const run = await start(schedulerTickerWorkflow, []);
  const value = await setTickerState({ runId: run.runId, enabled: true, startedAt: new Date().toISOString() });
  console.log("[TICKER] started", run.runId);
  return value;
}

/** Ask the loop to exit at its next wake-up. */
export async function stopTicker() {
  const value = await setTickerState({ enabled: false });
  console.log("[TICKER] stop requested");
  return value;
}

export async function tickerStatus() {
  const state = await getTickerState();
  let runStatus = null;
  if (state.runId) {
    try { runStatus = await getRun(state.runId).status; } catch { runStatus = "unknown"; }
  }
  return { ...state, runStatus };
}
