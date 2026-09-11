import { sleep } from "workflow";
import { prisma } from "@/lib/prisma";

/**
 * Smoke-test workflow: proves the Workflow DevKit compiles plain .js files,
 * that steps can reach the database, and that sleep() suspends and resumes.
 */
export async function helloWorkflow(label) {
  "use workflow";
  const started = await recordEvent(label, "started");
  await sleep("5s");
  const done = await recordEvent(label, "resumed");
  return { started, done };
}

async function recordEvent(label, step) {
  "use step";
  const ev = await prisma.pipelineEvent.create({
    data: { kind: "scheduler", step: `hello:${step}`, status: "ok", message: label, data: { at: new Date().toISOString() } },
  });
  return ev.id;
}
