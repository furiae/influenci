"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { FiLoader, FiDownload, FiRefreshCw } from "react-icons/fi";
import { PLATFORM_INFO } from "@/lib/platforms";
import { Section, btnPrimary, btnGhost, fmt, when } from "@/components/ui/form";

const BRAND_PLATFORMS = ["facebook", "instagram"];

export default function ChannelsTab({ actor, reload }) {
  const byPlatform = Object.fromEntries((actor.channels || []).map((c) => [c.platform, c]));
  const [implemented, setImplemented] = useState(null);
  const [busy, setBusy] = useState(null);
  useEffect(() => {
    fetch("/api/social").then((r) => (r.ok ? r.json() : { implemented: [] })).then((d) => setImplemented(d.implemented || [])).catch(() => setImplemented([]));
  }, []);

  const act = async (key, fn, okMsg) => {
    setBusy(key);
    try {
      const res = await fn();
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Failed");
      if (okMsg) toast.success(typeof okMsg === "function" ? okMsg(d) : okMsg);
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };
  const probe = (ch) => act(ch.id, () => fetch(`/api/channels/${ch.id}?action=probe`, { method: "POST" }), (d) => (d.ok ? `${PLATFORM_INFO[ch.platform].label} token is valid` : d.error));
  const disconnect = (ch) => confirm(`Disconnect ${PLATFORM_INFO[ch.platform].label}?`) && act(ch.id, () => fetch(`/api/channels/${ch.id}`, { method: "DELETE" }), "Disconnected");
  const importHistory = (ch, mode) => act(`${ch.id}-${mode}`, () => fetch(`/api/channels/${ch.id}/import`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode }) }), mode === "import" ? "Import started. This runs in the background; the page refreshes itself." : "Sync started.");
  const switchPage = (ch, pageId) => act(`${ch.id}-switch`, () => fetch(`/api/channels/${ch.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pageId }) }), "Switched Page. Run the import again.");

  const metaReady = implemented?.includes("facebook");
  const anyMeta = byPlatform.facebook || byPlatform.instagram;
  const importing = actor.importStatus === "importing";

  return (
    <div className="space-y-6">
      <Section title="Connected channels" hint="One Meta login connects the Facebook Page and the Instagram professional account linked to it. Page tokens do not expire; use Check to confirm access.">
        <div className="rounded-xl border border-divider divide-y divide-divider">
          {BRAND_PLATFORMS.map((p) => {
            const ch = byPlatform[p];
            return (
              <div key={p} className="flex items-center justify-between p-4 gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: PLATFORM_INFO[p].color }} />
                  {ch?.avatarUrl && <img src={ch.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover" />}
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-foreground">{PLATFORM_INFO[p].label}{ch?.handle ? <span className="text-muted font-normal"> · @{ch.handle}</span> : null}</div>
                    <div className="text-[11px] text-muted truncate">
                      {ch ? `${ch.status} · ${fmt(ch.followers)} followers${ch.mediaCount ? ` · ${ch.mediaCount} media` : ""} · ${ch.lastSyncedAt ? `synced ${when(ch.lastSyncedAt)}` : "never imported"}${ch.lastError ? ` · ${ch.lastError}` : ""}` : metaReady ? "Not connected" : "Add the Meta app credentials in Settings → Platform apps first"}
                    </div>
                    {ch?.availablePages?.length > 1 && (
                      <select value={ch.pageId || ""} onChange={(e) => switchPage(ch, e.target.value)} className="mt-1 bg-bg-page border border-divider rounded px-2 py-1 text-[11px]">
                        {ch.availablePages.map((pg) => <option key={pg.pageId} value={pg.pageId}>{pg.name}{pg.igUsername ? ` (@${pg.igUsername})` : ""}</option>)}
                      </select>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {ch && <button onClick={() => probe(ch)} disabled={busy === ch.id} className={btnGhost}>Check</button>}
                  {ch && <button onClick={() => disconnect(ch)} disabled={busy === ch.id} className="px-3 py-2 rounded-lg text-xs font-bold text-rose-500">Disconnect</button>}
                  {p === "facebook" && (
                    <a href={metaReady ? `/api/social/facebook/connect?actorId=${actor.id}` : undefined} className={`px-4 py-2 rounded-lg text-xs font-bold ${metaReady ? "bg-primary text-white" : "border border-divider text-muted pointer-events-none opacity-60"}`}>{anyMeta ? "Reconnect Meta" : "Connect Meta"}</a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-muted">Developer-app credentials live in <Link href="/settings/platforms" className="text-primary font-bold">Settings → Platform apps</Link>. Because these are Pages you administer, Meta&apos;s Standard Access is enough; no App Review is needed.</p>
      </Section>

      <Section title="History import" hint="Pulls every post with likes, comments, shares, saves, reach and views, then scores and analyses them. The first import can take a while; later syncs run daily on their own.">
        {!anyMeta ? <p className="text-xs text-muted">Connect Meta first.</p> : (
          <div className="flex flex-wrap gap-2">
            {BRAND_PLATFORMS.filter((p) => byPlatform[p]).map((p) => (
              <div key={p} className="flex items-center gap-2">
                <button onClick={() => importHistory(byPlatform[p], "import")} disabled={Boolean(busy) || importing} className={btnPrimary}>{busy === `${byPlatform[p].id}-import` || importing ? <FiLoader className="animate-spin" /> : <FiDownload />} Import {PLATFORM_INFO[p].label} history</button>
                <button onClick={() => importHistory(byPlatform[p], "sync")} disabled={Boolean(busy) || importing} className={btnGhost}><FiRefreshCw /> Sync</button>
              </div>
            ))}
          </div>
        )}
        {actor.importError && <p className="text-[11px] text-rose-500">Last import failed: {actor.importError}</p>}
        {actor.events?.length > 0 && (
          <div className="rounded-lg border border-divider divide-y divide-divider text-[11px]">
            {actor.events.slice(0, 8).map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-3 py-1.5">
                <span className={`font-bold ${e.status === "failed" ? "text-rose-500" : "text-muted"}`}>{e.kind}/{e.step}</span>
                <span className="flex-1 truncate text-foreground">{e.message}</span>
                <span className="text-muted">{new Date(e.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
