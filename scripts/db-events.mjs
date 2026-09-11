// Show recent pipeline events. Usage: node --env-file=.env.local scripts/db-events.mjs [limit]
import { prisma } from "../src/lib/prisma.js";
const limit = Number(process.argv[2] || 10);
const rows = await prisma.pipelineEvent.findMany({ orderBy: { createdAt: "desc" }, take: limit });
for (const r of rows) console.log(r.createdAt.toISOString(), r.kind, r.step, r.status, r.message ?? "");
await prisma.$disconnect();
