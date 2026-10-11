import { prisma } from "@/lib/prisma";

/** Resolve the Clerk user id carried by the OAuth token into our User row. */
export async function mcpUser(extra) {
  // @modelcontextprotocol/server 2.x surfaces the verified token as ctx.http.authInfo; older builds used ctx.authInfo.
  const info = extra?.http?.authInfo || extra?.authInfo;
  const userId = info?.extra?.userId || info?.extra?.sub || info?.clientId;
  if (!userId) throw new Error("Not signed in");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("Sign in to app.influenci.ai once before using the connector");
  return user;
}

export async function brandFor(user, brandId) {
  const actor = await prisma.actor.findFirst({ where: { id: brandId, userId: user.id, kind: "brand" } });
  if (!actor) throw new Error("Brand not found");
  return actor;
}

export function json(data) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 1) }] };
}

export function text(s) {
  return { content: [{ type: "text", text: String(s) }] };
}

export function fail(err) {
  return { isError: true, content: [{ type: "text", text: String(err?.message || err) }] };
}
