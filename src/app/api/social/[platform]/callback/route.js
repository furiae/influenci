import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { getConnector } from "@/lib/social";
import { getPlatformApp, redirectUri, baseUrl } from "@/lib/social/apps";
import { parseState, readCookie, clearCookieHeader } from "@/lib/social/oauth";

export const maxDuration = 60;

/** OAuth return: verify state, exchange the code, upsert Channel rows. */
export async function GET(req, { params }) {
  const { platform } = await params;
  const q = new URL(req.url).searchParams;
  const fail = (actorId, msg) => {
    const res = NextResponse.redirect(`${baseUrl()}${actorId ? `/actors/${actorId}?tab=channels` : "/actors"}&error=${encodeURIComponent(msg)}`.replace("/actors&error", "/actors?error"));
    res.headers.set("Set-Cookie", clearCookieHeader());
    return res;
  };

  const stateParam = q.get("state");
  const state = parseState(stateParam);
  const cookie = readCookie(req);
  if (!state || state.platform !== platform || cookie !== stateParam) return fail(state?.actorId, "Sign-in state did not match; try connecting again.");
  if (q.get("error")) return fail(state.actorId, q.get("error_description") || q.get("error"));
  const code = q.get("code");
  if (!code) return fail(state.actorId, "No authorization code returned");

  const connector = getConnector(platform);
  const app = connector && (await getPlatformApp(connector.appKey));
  if (!connector || !app) return fail(state.actorId, "Connector or app credentials missing");

  try {
    const result = await connector.exchangeCode({ app, redirectUri: redirectUri(platform), code, codeVerifier: state.codeVerifier });
    const actor = await prisma.actor.findUnique({ where: { id: state.actorId } });
    if (!actor) return fail(null, "Actor not found");
    const accounts = result.accounts || [];
    if (!accounts.length) return fail(actor.id, `No ${connector.label} account found on that login`);

    for (const acc of accounts) {
      const accessToken = acc.accessToken || result.accessToken;
      const data = {
        externalId: acc.externalId,
        handle: acc.handle || null,
        displayName: acc.displayName || null,
        avatarUrl: acc.avatarUrl || null,
        accessTokenEnc: encrypt(accessToken),
        refreshTokenEnc: result.refreshToken ? encrypt(result.refreshToken) : null,
        tokenExpiresAt: acc.expiresAt ?? result.expiresAt ?? null,
        refreshExpiresAt: result.refreshExpiresAt ?? null,
        scopes: result.scopes || connector.scopes,
        status: "connected",
        lastError: null,
        lastCheckedAt: new Date(),
        config: acc.config || {},
      };
      const targetPlatform = acc.platform || platform;
      const channel = await prisma.channel.upsert({
        where: { actorId_platform: { actorId: actor.id, platform: targetPlatform } },
        update: data,
        create: { actorId: actor.id, platform: targetPlatform, ...data },
      });
      if (connector.prepare) {
        try {
          const patch = await connector.prepare({ channel, token: accessToken });
          if (patch) await prisma.channel.update({ where: { id: channel.id }, data: { config: { ...(channel.config || {}), ...patch } } });
        } catch (err) {
          console.warn("[SOCIAL_PREPARE]", platform, err.message);
        }
      }
    }
    console.log("[SOCIAL_CONNECTED]", platform, actor.name, accounts.map((a) => a.handle || a.externalId));
    const res = NextResponse.redirect(`${baseUrl()}/actors/${actor.id}?tab=channels&connected=${platform}`);
    res.headers.set("Set-Cookie", clearCookieHeader());
    return res;
  } catch (err) {
    console.error("[SOCIAL_CALLBACK_ERROR]", platform, err);
    return fail(state.actorId, err.message || "Connection failed");
  }
}
