import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** The signed-in user's brand actor (kind "brand") or null. */
export async function ownedBrand(id) {
  const user = await requireUser();
  if (!user) return { user: null, actor: null };
  const actor = await prisma.actor.findFirst({ where: { id, userId: user.id, kind: "brand" } });
  return { user, actor };
}
