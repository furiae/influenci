import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "./prisma";

function ownerEmail() {
  return (process.env.OWNER_EMAIL || "").trim().toLowerCase();
}

function isOwnerEmail(email) {
  const o = ownerEmail();
  return Boolean(o && email && email.toLowerCase() === o);
}

/**
 * Resolve the signed-in Clerk user to our own User row (credits, API keys,
 * actors, creations). The row is created on first sight; the Clerk user id is
 * the primary key. Returns null when nobody is signed in.
 */
export async function requireUser() {
  const { userId } = await auth();
  if (!userId) return null;

  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (existing) {
    if (existing.role !== "owner" && isOwnerEmail(existing.email)) {
      return prisma.user.update({ where: { id: userId }, data: { role: "owner" } });
    }
    return existing;
  }

  const cu = await currentUser();
  const email = cu?.primaryEmailAddress?.emailAddress ?? cu?.emailAddresses?.[0]?.emailAddress ?? null;
  const name = [cu?.firstName, cu?.lastName].filter(Boolean).join(" ") || cu?.username || null;
  const image = cu?.imageUrl ?? null;
  const role = isOwnerEmail(email) ? "owner" : "member";

  try {
    return await prisma.user.create({ data: { id: userId, email, name, image, role } });
  } catch (err) {
    // Same email seen under a previous auth id: adopt that row.
    if (err?.code === "P2002" && email) {
      return prisma.user.update({ where: { email }, data: { id: userId, name, image, role } });
    }
    throw err;
  }
}

/** Like requireUser() but null unless the user is the owner. */
export async function requireOwner() {
  const user = await requireUser();
  return user?.role === "owner" ? user : null;
}

/** Secret-free view of the current user for the client. */
export function publicUser(user) {
  if (!user) return null;
  const keys = user.apiKeys && typeof user.apiKeys === "object" ? user.apiKeys : {};
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    role: user.role,
    credits: user.credits,
    hasKeys: Object.fromEntries(Object.entries(keys).filter(([, v]) => Boolean(v)).map(([k]) => [k, true])),
  };
}
