"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import toast, { Toaster } from "react-hot-toast";
import { FiCopy, FiCheck, FiExternalLink, FiLoader, FiShield } from "react-icons/fi";
import { useMe } from "@/lib/useMe";
import { invalidateAiMode } from "@/components/ui/ai-hint";

const CHECKLIST = {
  meta: [
    "Create a Business-type app at developers.facebook.com and add the Facebook Login for Business + Instagram products",
    "Add the two redirect URIs below under Facebook Login for Business → Settings → Valid OAuth Redirect URIs",
    "Optional: create a Login Configuration (Facebook Login for Business → Configurations) with the Page + Instagram permissions and paste its config ID below",
    "Make the Facebook user that admins the brand Pages an Admin of the app (App Roles); Standard Access covers Pages you manage, so no App Review is needed for your own brands",
    "Each brand: a Facebook Page + an Instagram Professional (Business/Creator) account linked to that Page (Page settings → Linked accounts)",
    "Only file App Review + Business Verification if you later connect Pages you do not administer",
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
  const [extra, setExtra] = useState(app.extra || {});
  const [saving, setSaving] = useState(false);
  const steps = CHECKLIST[app.key] || [];

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/platforms", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appKey: app.key, clientId, clientSecret: secret || undefined, reviewStatus: review, extra }),
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

      {app.key === "meta" && (
        <label className="block space-y-1">
          <span className="text-[11px] uppercase font-bold text-muted tracking-wider">Login configuration ID (optional)</span>
          <input value={extra.configId || ""} onChange={(e) => setExtra({ ...extra, configId: e.target.value.trim() })} placeholder="From Facebook Login for Business → Configurations" className="w-full bg-bg-page border border-divider rounded-lg px-3 py-2 text-sm" />
        </label>
      )}

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

const AI_STEPS = [
  "Clerk Dashboard → pick the environment this site actually runs on (Development if the site's key starts with pk_test, else Production) → Configure → Developers → OAuth applications → Settings → turn ON 'Publish DCR support'; leave 'Publish CIMD support' OFF (Clerk cannot fetch Claude's identity document and the sign-in fails with invalid_client)",
  "Claude.ai → Settings → Connectors → Add custom connector → paste the connector URL below exactly (no trailing dot) → Authentication 'Sign in now', OAuth client 'Register automatically' → Add → Connect → sign in with your Influenci account",
  "Claude Code: run the command below once; Claude Desktop uses the same URL under Settings → Connectors",
  "In Claude, open the Influenci connector's prompts (import-screenshots, weekly-review, recommend-posts, extract-design-system, write-winner-post) and pick a brand",
];

function AiCard() {
  const [ai, setAi] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { fetch("/api/settings/ai").then((r) => r.json()).then(setAi).catch(() => {}); }, []);
  const setMode = async (mode) => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/ai", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Save failed");
      setAi(d);
      invalidateAiMode();
      toast.success(mode === "subscription" ? "AI runs on your Claude subscription via the connector" : "AI runs on the server's API key");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };
  if (!ai) return null;
  const cli = `claude mcp add --transport http influenci ${ai.connector}`;
  return (
    <section id="ai" className="rounded-xl border border-divider bg-bg-card p-5 space-y-4">
      <div>
        <h2 className="text-sm font-black text-foreground">AI · Claude</h2>
        <p className="text-[11px] text-muted">Who pays for post analysis, summaries, design-system extraction and recommendations.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {[
          ["subscription", "Claude subscription (Max / Team)", "Claude.ai or Claude Code does the thinking through the Influenci MCP connector. The server only stores and scores. No API spend."],
          ["api", "Server API key (pay per token)", ai.hasApiKey ? "The server calls Claude with ANTHROPIC_API_KEY during imports and from the tab buttons." : "ANTHROPIC_API_KEY is not set on the server, so this option is unavailable."],
        ].map(([k, label, desc]) => (
          <button key={k} type="button" disabled={saving || (k === "api" && !ai.hasApiKey)} onClick={() => setMode(k)} className={`text-left rounded-lg border p-3 space-y-1 disabled:opacity-50 ${ai.mode === k ? "border-primary bg-primary/5" : "border-divider"}`}>
            <div className="text-xs font-bold text-foreground flex items-center gap-2">{ai.mode === k && <FiCheck className="text-primary" />}{label}</div>
            <p className="text-[11px] text-muted">{desc}</p>
          </button>
        ))}
      </div>
      <div className="space-y-2">
        <div className="text-[11px] uppercase font-bold text-muted tracking-wider">Connector URL (Claude.ai → Settings → Connectors → Add custom connector)</div>
        <div className="flex items-center gap-2 text-xs"><code className="flex-1 bg-bg-page border border-divider rounded px-2 py-1.5 truncate">{ai.connector}</code><CopyButton value={ai.connector} /></div>
        <div className="text-[11px] uppercase font-bold text-muted tracking-wider">Claude Code</div>
        <div className="flex items-center gap-2 text-xs"><code className="flex-1 bg-bg-page border border-divider rounded px-2 py-1.5 truncate">{cli}</code><CopyButton value={cli} /></div>
      </div>
      <div className="space-y-1.5">
        <div className="text-[11px] uppercase font-bold text-muted tracking-wider">Setup</div>
        {AI_STEPS.map((s, i) => <p key={i} className="text-xs text-foreground">{i + 1}. {s}</p>)}
      </div>
      {ai.image && <ImageGeneratorCard image={ai.image} onSaved={(d) => { setAi(d); invalidateAiMode(); }} />}
    </section>
  );
}

const GPU_STEPS = [
  "pip install modal && modal setup (free account, no card needed for the monthly allowance)",
  "modal secret create influenci-image IMAGE_GPU_TOKEN=<a long random string>",
  "modal deploy scripts/modal_flux_schnell.py → copy the https://…modal.run URL it prints",
  "Paste that URL and the same token below, pick 'Your serverless GPU', Save",
];

/**
 * Which generator draws brand keyframes (photo-style images behind a post).
 * Cards and designed SVGs never use it; they composite for free.
 */
function ImageGeneratorCard({ image, onSaved }) {
  const [provider, setProvider] = useState(image.provider);
  const [hfToken, setHfToken] = useState("");
  const [gpuEndpoint, setGpuEndpoint] = useState(image.gpuEndpoint || "");
  const [gpuToken, setGpuToken] = useState("");
  const [saving, setSaving] = useState(false);
  const current = image.providers.find((p) => p.id === provider);

  const save = async () => {
    setSaving(true);
    try {
      const payload = { provider, gpuEndpoint };
      if (hfToken) payload.hfToken = hfToken;
      if (gpuToken) payload.gpuToken = gpuToken;
      const res = await fetch("/api/settings/ai", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: payload }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Save failed");
      setHfToken("");
      setGpuToken("");
      onSaved(d);
      toast.success(`Images: ${d.image.providers.find((p) => p.id === d.image.provider)?.label || d.image.provider}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const clearToken = async (field) => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/ai", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: { [field]: "" } }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      onSaved(d);
      toast.success("Token removed");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const input = "w-full bg-bg-page border border-divider rounded-lg px-3 py-2 text-sm";
  const label = "text-[11px] uppercase font-bold text-muted tracking-wider";
  return (
    <div className="rounded-lg border border-divider p-4 space-y-3">
      <div>
        <h3 className="text-xs font-black text-foreground">Image generator</h3>
        <p className="text-[11px] text-muted">Draws the photo-style image behind a post when there is no template or SVG. Branded cards (winner, contender, throwback, question, photo) and Claude-designed SVGs always render for free. Video clips still render on Wavespeed.</p>
      </div>
      <label className="block space-y-1">
        <span className={label}>Provider</span>
        <select value={provider} onChange={(e) => setProvider(e.target.value)} className={input}>
          {image.providers.map((p) => (
            <option key={p.id} value={p.id} disabled={p.id === "wavespeed" && !image.hasWavespeedKey}>
              {p.label}{p.id === "wavespeed" && !image.hasWavespeedKey ? " — WAVESPEED_API_KEY not set" : ""}
            </option>
          ))}
        </select>
        {current && <p className="text-[11px] text-muted">{current.description}</p>}
      </label>

      {provider === "zerogpu" && (
        <label className="block space-y-1">
          <span className={label}>Hugging Face token (optional) {image.hasHfToken && <span className="text-emerald-600 normal-case font-semibold">(set)</span>}</span>
          <div className="flex items-center gap-2">
            <input type="password" value={hfToken} onChange={(e) => setHfToken(e.target.value)} placeholder={image.hasHfToken ? "•••••••• (leave blank to keep)" : "hf_… from huggingface.co/settings/tokens (Read)"} className={input} />
            {image.hasHfToken && <button type="button" onClick={() => clearToken("hfToken")} disabled={saving} className="text-[11px] font-bold text-muted hover:text-rose-500 whitespace-nowrap">Remove</button>}
          </div>
          <p className="text-[11px] text-muted">Without a token the Space runs on the anonymous quota, which can be exhausted by mid-day. A free token gives the account its own quota; a PRO account ($9/mo) gets about 25 minutes of GPU a day.</p>
        </label>
      )}

      {provider === "gpu" && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className={label}>Endpoint URL</span>
              <input value={gpuEndpoint} onChange={(e) => setGpuEndpoint(e.target.value.trim())} placeholder="https://…modal.run" className={input} />
            </label>
            <label className="block space-y-1">
              <span className={label}>Bearer token {image.hasGpuToken && <span className="text-emerald-600 normal-case font-semibold">(set)</span>}</span>
              <div className="flex items-center gap-2">
                <input type="password" value={gpuToken} onChange={(e) => setGpuToken(e.target.value)} placeholder={image.hasGpuToken ? "•••••••• (leave blank to keep)" : "IMAGE_GPU_TOKEN"} className={input} />
                {image.hasGpuToken && <button type="button" onClick={() => clearToken("gpuToken")} disabled={saving} className="text-[11px] font-bold text-muted hover:text-rose-500 whitespace-nowrap">Remove</button>}
              </div>
            </label>
          </div>
          <div className="space-y-1">
            <div className={label}>Deploy FLUX.1 schnell on Modal (about 10 minutes)</div>
            {GPU_STEPS.map((s, i) => <p key={i} className="text-xs text-foreground">{i + 1}. {s}</p>)}
            <p className="text-[11px] text-muted">Any endpoint works if it accepts POST {"{ prompt, width, height, seed, steps }"} with a bearer token and returns a PNG/JPEG body or {"{ image: <base64>, mime }"}. Modal&apos;s free allowance covers roughly 300 images a month on an L4; after that each image is under a cent.</p>
          </div>
        </div>
      )}

      {provider === "wavespeed" && (
        <p className="text-[11px] text-muted">Billed to the server&apos;s Wavespeed account. Top up at wavespeed.ai when previews fail with &ldquo;Insufficient credits&rdquo;, or switch to a free provider above.</p>
      )}

      <div className="flex justify-end">
        <button onClick={save} disabled={saving} className="px-5 py-2 rounded-lg bg-primary text-white text-xs font-bold disabled:opacity-50">{saving ? "Saving…" : "Save image generator"}</button>
      </div>
    </div>
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
        {apps && <AiCard />}
        {apps?.map((app) => <AppCard key={app.key} app={app} onSaved={setApps} />)}
      </div>
    </div>
  );
}
