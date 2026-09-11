// Promote OWNER_EMAIL to owner. Usage: node --env-file=.env.local scripts/db-owner.mjs
import { prisma } from "../src/lib/prisma.js";
const email = (process.env.OWNER_EMAIL || "").toLowerCase();
const r = await prisma.user.updateMany({ where: { email: { equals: email, mode: "insensitive" } }, data: { role: "owner" } });
console.log("owner rows updated:", r.count, "for", email || "(OWNER_EMAIL unset)");
await prisma.$disconnect();
