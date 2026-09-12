import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getConnector } from "@/lib/social";
import { getPlatformApp, redirectUri, baseUrl } from "@/lib/social/apps";
import { buildState, pkcePair, cookieHeader } from "@/lib/social/oauth";

/** GET ?actorId= → redirect to the platform's consent screen. */
export async function GET(req, { params }) {
  const { platform } = await params;
  const user = await requireUser();
  if (!user) return NextResponse.redirect(`${baseUrl()}/login`);
  const actorId = new URL(req.url).searchParams.get("actorId");
  const actor = actorId ? await prisma.actor.findFirst({ where: { id: actorId, userId: user.id } }) : null;
  const back = actor ? `${baseUrl()}/actors/${actor.id}?tab=channels` : `${baseUrl()}/actors`;
  if (!actor) return NextResponse.redirect(`${back}&error=${encodeURIComponent("Actor not found")}`);

  const connector = getConnector(platform);
  if (!connector) return NextResponse.redirect(`${back}&error=${encodeURIComponent(`${platform} connector is not available yet`)}`);
  const app = await getPlatformApp(connector.appKey);
  if (!app) return NextResponse.redirect(`${back}&error=${encodeURIComponent(`Add the ${connector.label} developer app credentials in Settings → Platform apps first`)}`);

  const pkce = connector.pkce ? pkcePair() : {};
  const state = buildState({ actorId: actor.id, platform, codeVerifier: pkce.codeVerifier || null });
  const url = connector.authUrl({ app, redirectUri: redirectUri(platform), state, codeChallenge: pkce.codeChallenge });
  console.log("[SOCIAL_CONNECT]", platform, actor.name);
  const res = NextResponse.redirect(url);
  res.headers.set("Set-Cookie", cookieHeader(state));
  return res;
}
