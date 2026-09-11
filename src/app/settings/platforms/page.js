"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import toast, { Toaster } from "react-hot-toast";
import { FiCopy, FiCheck, FiExternalLink, FiLoader, FiShield } from "react-icons/fi";
import { useMe } from "@/lib/useMe";

const CHECKLIST = {
  meta: [
    "Create a Business-type app at developers.facebook.com and add Facebook Login for Business + Instagram products",
    "Add the two redirect URIs below under Facebook Login → Settings → Valid OAuth Redirect URIs",
    "Make the Facebook user that owns the 7 Pages an Admin of the app (App Roles)",
    "Each actor: a Facebook Page + an Instagram Creator/Business account linked to that Page",
    "Only file App Review if publishing is blocked at Standard Access",
  ],
  tiktok: [
    "Create an app at developers.tiktok.com, add Login Kit + Content Posting API (Direct Post)",
    "Scopes: user.info.basic, video.publish, video.upload; add the redirect URI below",
    "Host Terms + Privacy pages and verify the app.influenci.ai domain",
    "Add the 7 TikTok accounts as sandbox target users, test with SELF_ONLY",
    "Record the demo video and submit for audit; public posting after approval",
  ],
  youtube: [
    "Google Cloud project → enable YouTube Data API v3",
    "OAuth consent screen: External, add youtube.upload + youtube.readonly scopes, then Publish (no verification needed for < 100 users)",
    "Credentials → OAuth client ID → Web application → add the redirect URI below",
    "One Google login owning 7 Brand Account channels works best",
  ],
  pinterest: [
    "Business account → developers.pinterest.com → create app, add the redirect URI",
    "Request Trial access; test with the app owner's account",
    "Submit the Standard access request (demo recording) so other actor accounts can post publicly",
  ],
  x: [
    "developer.x.com → project + app with OAuth 2.0 (Web App), Read and Write",
    "Enable pay-per-use billing (about $0.015 per post)",
    "Add the redirect URI below and the website URL",
  ],
};

function CopyButton({ value }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500); }}
      className="p-1.5 rounded border border-divider text-muted hover:text-foreground"
      title="Copy"
    >
      {done ? <FiCheck className="text-emerald-500" /> : <FiCopy />}
    </button>
  );
}

function AppCard({ app, onSaved }) {
  const [clientId, setClientId] = useState(app.clientId || "");
  const [secret, setSecret] = useState("");
  const [review, setReview] = useState(app.reviewStatus || {});
  const [saving, setSaving] = useState(false);
  const steps = CHECKLIST[app.key] || [];

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/platforms", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appKey: app.key, clientId, clientSecret: secret || undefined, reviewStatus: review }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      toast.success(`${app.label} saved`);
      setSecret("");
      onSaved(data.apps);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-divider bg-bg-card p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-black text-foreground">{app.label}</h2>
          <p className="text-[11px] text-muted">
            {app.platforms.join(" + ")} · credentials {app.source === "db" ? "saved here" : app.source === "env" ? "from environment" : "not set"}
          </p>
        </div>
        <a href={app.portal} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-primary flex items-center gap-1">Developer portal <FiExternalLink /></a>
      </div>

      <div className="space-y-2">
        <div className="text-[11px] uppercase font-bold text-muted tracking-wider">Redirect URIs to paste into the portal</div>
        {app.redirectUris.map((u) => (
          <div key={u} className="flex items-center gap-2 text-xs">
            <code className="flex-1 bg-bg-page border border-divider rounded px-2 py-1.5 truncate">{u}</code>
            <CopyButton value={u} />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="text-[11px] uppercase font-bold text-muted tracking-wider">Client ID / App ID / Client key</span>
          <input value={clientId} onChange={(e) => setClientId(e.target.value)} className="w-full bg-bg-page border border-divider rounded-lg px-3 py-2 text-sm" />
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] uppercase font-bold text-muted tracking-wider">Client secret {app.hasSecret && <span className="text-emerald-600 normal-case font-semibold">(set)</span>}</span>
          <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={app.hasSecret ? "•••••••• (leave blank to keep)" : "paste secret"} className="w-full bg-bg-page border border-divider rounded-lg px-3 py-2 text-sm" />
        </label>
      </div>

      <div className="space-y-1.5">
        <div className="text-[11px] uppercase font-bold text-muted tracking-wider">Setup checklist</div>
        {steps.map((s, i) => (
          <label key={i} className="flex items-start gap-2 text-xs text-foreground cursor-pointer">
            <input type="checkbox" checked={Boolean(review[`step${i}`])} onChange={(e) => setReview({ ...review, [`step${i}`]: e.target.checked })} className="mt-0.5 accent-primary" />
            <span className={review[`step${i}`] ? "line-through text-muted" : ""}>{s}</span>
          </label>
        ))}
      </div>

      <div className="flex justify-end">
        <button onClick={save} disabled={saving} className="px-5 py-2 rounded-lg bg-primary text-white text-xs font-bold disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
      </div>
    </section>
  );
}

export default function PlatformSettings() {
  const { me, isLoaded } = useMe();
  const [apps, setApps] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isLoaded || !me) return;
    fetch("/api/settings/platforms")
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || "Failed"); return d; })
      .then((d) => setApps(d.apps))
      .catch((e) => setError(e.message));
  }, [isLoaded, me]);

  if (isLoaded && me && me.role !== "owner") {
    return <div className="p-12 text-center text-sm text-muted"><FiShield className="mx-auto text-2xl mb-2" />Platform settings are only available to the workspace owner.</div>;
  }

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-12">
      <Toaster position="top-right" />
      <header className="max-w-4xl mx-auto mb-8 space-y-2">
        <div className="flex items-center gap-3 text-xs font-bold text-muted">
          <Link href="/settings/keys" className="hover:text-foreground">Provider keys</Link>
          <span>·</span>
          <span className="text-foreground">Platform apps</span>
        </div>
        <h1 className="text-2xl font-black text-foreground">Platform developer apps</h1>
        <p className="text-muted text-xs leading-relaxed max-w-2xl">
          One developer app per platform lets every actor connect its own account. Create each app in the platform&apos;s portal, paste the redirect URI, then save the credentials here. Secrets are encrypted at rest and never shown again.
        </p>
      </header>
      <div className="max-w-4xl mx-auto space-y-6">
        {error && <div className="text-xs text-rose-500">{error}</div>}
        {!apps && !error && <div className="py-20 flex justify-center"><FiLoader className="animate-spin text-primary text-2xl" /></div>}
        {apps?.map((app) => <AppCard key={app.key} app={app} onSaved={setApps} />)}
      </div>
    </div>
  );
}
