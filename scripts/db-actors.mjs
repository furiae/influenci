// Actor identity status. Usage: node --env-file=.env.local scripts/db-actors.mjs
import { prisma } from "../src/lib/prisma.js";
const actors = await prisma.actor.findMany({ orderBy: { createdAt: "asc" }, include: { _count: { select: { posts: true } } } });
for (const a of actors) console.log(`${a.slug ?? "-"}\t${a.kind}\t${a.identityStatus}\thero=${a.imageUrl ? "yes" : "no"}\trefs=${a.referenceImages.length}\tlora=${a.loraUrl ? "yes" : "no"}\tposts=${a._count.posts}\tid=${a.id}${a.identityError ? `\terror=${a.identityError}` : ""}`);
await prisma.$disconnect();
