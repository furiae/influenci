// List app users (no secrets). Usage: node --env-file=.env.local scripts/db-users.mjs
import { prisma } from "../src/lib/prisma.js";
const users = await prisma.user.findMany({ select: { id: true, email: true, name: true, credits: true } });
for (const u of users) console.log(`${u.email ?? "(no email)"}\t${u.name ?? ""}\tcredits=${u.credits}\tid=${u.id.slice(0, 14)}…`);
await prisma.$disconnect();
