"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { upload } from "@vercel/blob/client";
import toast, { Toaster } from "react-hot-toast";
import { FiUpload, FiLoader, FiTrash2, FiZap, FiCheckCircle, FiAlertCircle, FiUser, FiSliders, FiCalendar, FiLink, FiFilm, FiArrowLeft, FiPlay, FiTrendingUp } from "react-icons/fi";
import { PLATFORMS, PLATFORM_INFO } from "@/lib/platforms";
import CompetitorsTab from "@/components/actor/CompetitorsTab";

const TABS = [
  { id: "profile", label: "Profile", icon: FiUser },
  { id: "identity", label: "Identity", icon: FiZap },
  { id: "cadence", label: "Cadence", icon: FiSliders },
  { id: "competitors", label: "Competitors", icon: FiTrendingUp },
  { id: "channels", label: "Channels", icon: FiLink },
  { id: "posts", label: "Posts", icon: FiFilm },
];

const Field = ({ label, children, hint }) => (
  <label className="block space-y-1">
    <span className="text-[11px] uppercase font-bold text-muted tracking-wider">{label}</span>
    {children}
    {hint && <span className="block text-[11px] text-muted">{hint}</span>}
  </label>
);
const inputCls = "w-full bg-bg-page border border-divider rounded-lg px-3 py-2 text-sm outline-none focus:border-primary";
const listToText = (arr) => (Array.isArray(arr) ? arr.join("\n") : "");
const textToList = (s) => String(s || "").split("\n").map((x) => x.trim()).filter(Boolean);

function StatusPill({ status }) {
  const map = {
    none: ["Not built", "bg-glass-hover text-muted"],
    generating_refs: ["Generating references…", "bg-amber-500/10 text-amber-600"],
    training: ["Training LoRA…", "bg-amber-500/10 text-amber-600"],
    ready: ["Ready", "bg-emerald-500/10 text-emerald-600"],
    failed: ["Failed", "bg-rose-500/10 text-rose-600"],
  };
  const [label, cls] = map[status] || map.none;
  return <span className={`text-[10px] font-black uppercase px-2 py-1 rounded ${cls}`}>{label}</span>;
}

function ProfileTab({ actor, save, saving }) {
  const b = actor.bible || {};
  const v = b.visual || {};
  const [form, setForm] = useState({
    name: actor.name, slug: actor.slug || "", kind: actor.kind, timezone: actor.timezone, notes: actor.notes || "",
    canonicalPrompt: actor.canonicalPrompt || "", negativePrompt: actor.negativePrompt || "",
    tagline: b.tagline || "", bio: b.bio || "", age: b.age ?? "", pronouns: b.pronouns || "", location: b.location || "", niche: b.niche || "",
    contentPillars: listToText(b.contentPillars), toneOfVoice: b.toneOfVoice || "", catchphrases: listToText(b.catchphrases), doNots: listToText(b.doNots),
    audience: b.audience || "", aiDisclosure: b.aiDisclosure || "AI-generated character",
    vDescription: v.description || "", wardrobe: listToText(v.wardrobe), signatureProps: listToText(v.signatureProps), settings: listToText(v.settings), lighting: v.lighting || "", cameraStyle: v.cameraStyle || "",
  });
  const [generating, setGenerating] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = () => save({
    name: form.name, slug: form.slug, kind: form.kind, timezone: form.timezone, notes: form.notes,
    canonicalPrompt: form.canonicalPrompt, negativePrompt: form.negativePrompt,
    bible: {
      tagline: form.tagline, bio: form.bio, age: form.age === "" ? null : Number(form.age), pronouns: form.pronouns, location: form.location, niche: form.niche,
      contentPillars: textToList(form.contentPillars), toneOfVoice: form.toneOfVoice, catchphrases: textToList(form.catchphrases), doNots: textToList(form.doNots),
      audience: form.audience, aiDisclosure: form.aiDisclosure,
      visual: { description: form.vDescription, wardrobe: textToList(form.wardrobe), signatureProps: textToList(form.signatureProps), settings: textToList(form.settings), lighting: form.lighting, cameraStyle: form.cameraStyle },
    },
  });

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/actors/${actor.id}/bible`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notes: form.notes, keepPrompt: Boolean(form.canonicalPrompt) }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success("Bible drafted. Review and save.");
      window.location.reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-divider bg-bg-card p-5 grid grid-cols-1 md:grid-cols-4 gap-4">
        <Field label="Name"><input className={inputCls} value={form.name} onChange={set("name")} /></Field>
        <Field label="Slug"><input className={inputCls} value={form.slug} onChange={set("slug")} /></Field>
        <Field label="Kind">
          <select className={inputCls} value={form.kind} onChange={set("kind")}><option value="human">Human</option><option value="pet">Pet</option></select>
        </Field>
        <Field label="Timezone"><input className={inputCls} value={form.timezone} onChange={set("timezone")} /></Field>
        <div className="md:col-span-4">
          <Field label="Notes for the writer (what this actor is about)"><textarea rows={2} className={inputCls} value={form.notes} onChange={set("notes")} /></Field>
        </div>
        <div className="md:col-span-4 flex justify-end">
          <button onClick={generate} disabled={generating} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-primary/40 text-primary text-xs font-bold disabled:opacity-50">
            {generating ? <FiLoader className="animate-spin" /> : <FiZap />} Draft bible with Claude
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-divider bg-bg-card p-5 space-y-4">
        <h3 className="text-sm font-black text-foreground">Look (locked identity prompt)</h3>
        <Field label="Canonical prompt" hint="One dense sentence used verbatim in every image request. Distinct marks matter more than adjectives."><textarea rows={3} className={inputCls} value={form.canonicalPrompt} onChange={set("canonicalPrompt")} /></Field>
        <Field label="Negative prompt (optional)"><input className={inputCls} value={form.negativePrompt} onChange={set("negativePrompt")} /></Field>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Visual summary"><input className={inputCls} value={form.vDescription} onChange={set("vDescription")} /></Field>
          <Field label="Lighting"><input className={inputCls} value={form.lighting} onChange={set("lighting")} /></Field>
          <Field label="Wardrobe (one per line)"><textarea rows={3} className={inputCls} value={form.wardrobe} onChange={set("wardrobe")} /></Field>
          <Field label="Signature props (one per line)"><textarea rows={3} className={inputCls} value={form.signatureProps} onChange={set("signatureProps")} /></Field>
          <Field label="Usual settings (one per line)"><textarea rows={3} className={inputCls} value={form.settings} onChange={set("settings")} /></Field>
          <Field label="Camera style"><input className={inputCls} value={form.cameraStyle} onChange={set("cameraStyle")} /></Field>
        </div>
      </section>

      <section className="rounded-xl border border-divider bg-bg-card p-5 space-y-4">
        <h3 className="text-sm font-black text-foreground">Voice</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Tagline"><input className={inputCls} value={form.tagline} onChange={set("tagline")} /></Field>
          <Field label="Niche"><input className={inputCls} value={form.niche} onChange={set("niche")} /></Field>
          <div className="md:col-span-2"><Field label="Bio"><textarea rows={2} className={inputCls} value={form.bio} onChange={set("bio")} /></Field></div>
          <Field label="Age"><input className={inputCls} value={form.age} onChange={set("age")} /></Field>
          <Field label="Pronouns"><input className={inputCls} value={form.pronouns} onChange={set("pronouns")} /></Field>
          <Field label="Location"><input className={inputCls} value={form.location} onChange={set("location")} /></Field>
          <Field label="Audience"><input className={inputCls} value={form.audience} onChange={set("audience")} /></Field>
          <Field label="Content pillars (one per line)"><textarea rows={4} className={inputCls} value={form.contentPillars} onChange={set("contentPillars")} /></Field>
          <Field label="Tone of voice"><textarea rows={4} className={inputCls} value={form.toneOfVoice} onChange={set("toneOfVoice")} /></Field>
          <Field label="Catchphrases (one per line)"><textarea rows={3} className={inputCls} value={form.catchphrases} onChange={set("catchphrases")} /></Field>
          <Field label="Never (one per line)"><textarea rows={3} className={inputCls} value={form.doNots} onChange={set("doNots")} /></Field>
          <div className="md:col-span-2"><Field label="AI disclosure line (appended to every caption)"><input className={inputCls} value={form.aiDisclosure} onChange={set("aiDisclosure")} /></Field></div>
        </div>
      </section>
      <div className="flex justify-end"><button onClick={submit} disabled={saving} className="px-6 py-2.5 rounded-lg bg-primary text-white text-sm font-bold disabled:opacity-50">{saving ? "Saving…" : "Save profile"}</button></div>
    </div>
  );
}

function IdentityTab({ actor, reload }) {
  const heroRef = useRef(null);
  const refsRef = useRef(null);
  const [busy, setBusy] = useState(null);
  const [test, setTest] = useState(null);
  const isPet = actor.kind === "pet";

  const uploadFiles = async (files, asHero) => {
    setBusy("upload");
    try {
      const urls = [];
      for (const file of files) {
        const blob = await upload(`actors/${actor.slug || actor.id}/${file.name}`, file, { access: "public", handleUploadUrl: "/api/upload" });
        urls.push(blob.url);
      }
      const patch = asHero ? { imageUrl: urls[0] } : { referenceImages: [...(actor.referenceImages || []), ...urls] };
      const res = await fetch(`/api/actors/${actor.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      if (!res.ok) throw new Error("Save failed");
      toast.success(asHero ? "Main photo set" : `${urls.length} photo(s) added`);
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  const removeRef = async (url) => {
    const res = await fetch(`/api/actors/${actor.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ referenceImages: (actor.referenceImages || []).filter((u) => u !== url) }) });
    if (res.ok) reload();
  };

  const act = async (action, extra = {}) => {
    setBusy(action);
    try {
      const res = await fetch(`/api/actors/${actor.id}/identity`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      if (action === "test-keyframe") setTest(data);
      else toast.success(action === "train" ? (isPet ? "Training started (about 7 minutes)" : "Building reference set") : action === "generate-hero" ? "Portrait generated" : "Reset");
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  const refCount = (actor.referenceImages || []).length;
  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-divider bg-bg-card p-5 grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="space-y-2">
          <div className="text-[11px] uppercase font-bold text-muted tracking-wider">Main reference photo</div>
          <div className="aspect-[3/4] rounded-lg bg-glass-hover border border-divider overflow-hidden flex items-center justify-center">
            {actor.imageUrl ? <img src={actor.imageUrl} alt="" className="w-full h-full object-cover" /> : <span className="text-xs text-muted p-4 text-center">Front-facing, good light, {isPet ? "whole animal visible" : "shoulders up"}</span>}
          </div>
          <button onClick={() => heroRef.current?.click()} disabled={busy === "upload"} className="w-full py-2 rounded-lg border border-divider text-xs font-bold flex items-center justify-center gap-2"><FiUpload /> {actor.imageUrl ? "Replace" : "Upload"}</button>
          <button onClick={() => act("generate-hero")} disabled={busy} className="w-full py-2 rounded-lg border border-primary/40 text-primary text-xs font-bold flex items-center justify-center gap-2">{busy === "generate-hero" ? <FiLoader className="animate-spin" /> : <FiZap />} Generate from prompt ($0.14)</button>
          <input ref={heroRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) uploadFiles([f], true); }} />
        </div>
        <div className="md:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[11px] uppercase font-bold text-muted tracking-wider">{isPet ? "Training photos" : "Reference angles"} ({refCount})</div>
            <StatusPill status={actor.identityStatus} />
          </div>
          <p className="text-xs text-muted leading-relaxed">
            {isPet
              ? "Upload 5–10 real photos: different angles, indoor and outdoor light, sitting and standing, close-ups of the markings. Then train a LoRA ($1, ~7 min) so every image keeps the exact coat, markings and ears."
              : "The main photo is enough to start. Building the reference set generates 4 extra angles from it (about $0.30) so keyframes can condition on several views."}
          </p>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
            {(actor.referenceImages || []).map((u) => (
              <div key={u} className="relative group aspect-square rounded-md overflow-hidden border border-divider">
                <img src={u} alt="" className="w-full h-full object-cover" />
                <button onClick={() => removeRef(u)} className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white"><FiTrash2 /></button>
              </div>
            ))}
            <button onClick={() => refsRef.current?.click()} disabled={busy === "upload"} className="aspect-square rounded-md border-2 border-dashed border-divider text-muted hover:text-foreground flex items-center justify-center"><FiUpload /></button>
            <input ref={refsRef} type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const fs = Array.from(e.target.files || []); e.target.value = ""; if (fs.length) uploadFiles(fs, false); }} />
          </div>
          {actor.identityError && <div className="text-xs text-rose-500 flex items-center gap-1"><FiAlertCircle /> {actor.identityError}</div>}
          <div className="flex flex-wrap gap-2 pt-2">
            <button onClick={() => act("train")} disabled={!actor.imageUrl || busy || ["training", "generating_refs"].includes(actor.identityStatus)} className="px-4 py-2 rounded-lg bg-primary text-white text-xs font-bold disabled:opacity-50 flex items-center gap-2">
              {busy === "train" ? <FiLoader className="animate-spin" /> : <FiZap />} {isPet ? "Train LoRA" : "Build reference set"}
            </button>
            <button onClick={() => act("test-keyframe")} disabled={!actor.imageUrl || busy} className="px-4 py-2 rounded-lg border border-divider text-xs font-bold disabled:opacity-50 flex items-center gap-2">
              {busy === "test-keyframe" ? <FiLoader className="animate-spin" /> : <FiPlay />} Test keyframe (~$0.10)
            </button>
            <button onClick={() => act("reset")} disabled={busy} className="px-4 py-2 rounded-lg text-xs font-bold text-muted">Reset identity</button>
          </div>
          {isPet && actor.loraUrl && <div className="text-[11px] text-emerald-600 flex items-center gap-1"><FiCheckCircle /> LoRA trained · trigger word <code>{actor.loraTriggerWord}</code></div>}
          {!isPet && actor.klingElementId && <div className="text-[11px] text-emerald-600 flex items-center gap-1"><FiCheckCircle /> Kling element {actor.klingElementId}</div>}
        </div>
      </section>

      {test && (
        <section className="rounded-xl border border-divider bg-bg-card p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
          <img src={actor.imageUrl} alt="reference" className="aspect-[3/4] object-cover rounded-lg border border-divider" />
          <img src={test.url} alt="test keyframe" className="aspect-[3/4] object-cover rounded-lg border border-divider" />
          <div className="space-y-2 text-xs">
            <div className={`text-2xl font-black ${test.pass ? "text-emerald-600" : "text-rose-500"}`}>{Math.round(test.score * 100)}%</div>
            <div className="text-muted">identity match {test.pass ? "(passes)" : "(below the 75% threshold)"}</div>
            {test.issues?.length > 0 && <ul className="list-disc pl-4 text-muted">{test.issues.map((i, k) => <li key={k}>{i}</li>)}</ul>}
            <p className="text-[11px] text-muted">If the score is low, sharpen the canonical prompt with the exact distinguishing marks, or {isPet ? "add more training photos and retrain" : "replace the main photo with a cleaner front-facing shot"}.</p>
          </div>
        </section>
      )}
    </div>
  );
}

function CadenceTab({ actor, save, saving }) {
  const c = actor.cadenceResolved || {};
  const clip = actor.defaultClip || { lengthSec: 5, audio: true, mediaType: "video" };
  const [form, setForm] = useState({
    window: { ...c.window }, minSpacingMinutes: c.minSpacingMinutes, platforms: { ...c.platforms },
    videosPerDay: actor.videosPerDay, autoPublish: actor.autoPublish, active: actor.active,
    lengthSec: clip.lengthSec, audio: clip.audio !== false, mediaType: clip.mediaType || "video",
  });
  const perDay = Object.values(form.platforms).reduce((a, p) => a + Number(p.perDay || 0), 0);
  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-divider bg-bg-card p-5 space-y-4">
        <h3 className="text-sm font-black text-foreground">Posts per day, per platform</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {PLATFORMS.map((p) => (
            <Field key={p} label={PLATFORM_INFO[p].label}>
              <select className={inputCls} value={form.platforms[p]?.perDay ?? 0} onChange={(e) => setForm((f) => ({ ...f, platforms: { ...f.platforms, [p]: { perDay: Number(e.target.value) } } }))}>
                {[0, 0.5, 1, 2, 3, 4, 5, 6, 8, 10].map((n) => <option key={n} value={n}>{n === 0.5 ? "every other day" : n}</option>)}
              </select>
            </Field>
          ))}
        </div>
        <p className="text-xs text-muted">≈ {perDay} posts/day across platforms. Warm-up defaults keep new accounts safe; raise these as accounts age.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Field label="Window start"><input type="time" className={inputCls} value={form.window.start} onChange={(e) => setForm((f) => ({ ...f, window: { ...f.window, start: e.target.value } }))} /></Field>
          <Field label="Window end"><input type="time" className={inputCls} value={form.window.end} onChange={(e) => setForm((f) => ({ ...f, window: { ...f.window, end: e.target.value } }))} /></Field>
          <Field label="Min minutes between posts"><input type="number" className={inputCls} value={form.minSpacingMinutes} onChange={(e) => setForm((f) => ({ ...f, minSpacingMinutes: Number(e.target.value) }))} /></Field>
          <Field label="Videos rendered per day"><input type="number" min={0} max={6} className={inputCls} value={form.videosPerDay} onChange={(e) => setForm((f) => ({ ...f, videosPerDay: Number(e.target.value) }))} /></Field>
        </div>
      </section>
      <section className="rounded-xl border border-divider bg-bg-card p-5 space-y-4">
        <h3 className="text-sm font-black text-foreground">Default clip</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Field label="Media"><select className={inputCls} value={form.mediaType} onChange={(e) => setForm((f) => ({ ...f, mediaType: e.target.value }))}><option value="video">Video</option><option value="image">Still image</option></select></Field>
          <Field label="Length"><select className={inputCls} value={form.lengthSec} onChange={(e) => setForm((f) => ({ ...f, lengthSec: Number(e.target.value) }))}><option value={5}>5 seconds</option><option value={10}>10 seconds</option></select></Field>
          <Field label="Audio"><select className={inputCls} value={form.audio ? "on" : "off"} onChange={(e) => setForm((f) => ({ ...f, audio: e.target.value === "on" }))}><option value="on">Native audio</option><option value="off">Silent</option></select></Field>
        </div>
        <p className="text-xs text-muted">{actor.kind === "pet" ? "Pets: about $0.25 per 5 s with ambient audio (Wan 2.6)." : "Humans: about $0.70 per 5 s with sound (Kling 2.6 Pro), $0.35 silent."}</p>
      </section>
      <section className="rounded-xl border border-divider bg-bg-card p-5 space-y-3">
        <label className="flex items-center gap-3 text-sm"><input type="checkbox" className="accent-primary" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} /> Active (the daily planner creates posts for this actor)</label>
        <label className="flex items-center gap-3 text-sm"><input type="checkbox" className="accent-primary" checked={form.autoPublish} onChange={(e) => setForm((f) => ({ ...f, autoPublish: e.target.checked }))} /> Auto-publish rendered posts without approval <span className="text-[11px] text-amber-600">(only once you trust the output)</span></label>
      </section>
      <div className="flex justify-end">
        <button onClick={() => save({ cadence: { window: form.window, minSpacingMinutes: form.minSpacingMinutes, platforms: form.platforms }, videosPerDay: form.videosPerDay, autoPublish: form.autoPublish, active: form.active, defaultClip: { lengthSec: form.lengthSec, audio: form.audio, mediaType: form.mediaType } })} disabled={saving} className="px-6 py-2.5 rounded-lg bg-primary text-white text-sm font-bold disabled:opacity-50">{saving ? "Saving…" : "Save cadence"}</button>
      </div>
    </div>
  );
}

function ChannelsTab({ actor, reload }) {
  const byPlatform = Object.fromEntries((actor.channels || []).map((c) => [c.platform, c]));
  const [implemented, setImplemented] = useState(null);
  const [busy, setBusy] = useState(null);
  useEffect(() => {
    fetch("/api/social").then((r) => (r.ok ? r.json() : { implemented: [] })).then((d) => setImplemented(d.implemented || [])).catch(() => setImplemented([]));
  }, []);

  const probe = async (ch) => {
    setBusy(ch.id);
    try {
      const res = await fetch(`/api/channels/${ch.id}?action=probe`, { method: "POST" });
      const d = await res.json();
      d.ok ? toast.success(`${PLATFORM_INFO[ch.platform].label} token is valid`) : toast.error(d.error || "Check failed");
      reload();
    } finally {
      setBusy(null);
    }
  };
  const disconnect = async (ch) => {
    if (!confirm(`Disconnect ${PLATFORM_INFO[ch.platform].label}?`)) return;
    setBusy(ch.id);
    await fetch(`/api/channels/${ch.id}`, { method: "DELETE" });
    setBusy(null);
    reload();
  };

  return (
    <div className="rounded-xl border border-divider bg-bg-card divide-y divide-divider">
      {PLATFORMS.map((p) => {
        const ch = byPlatform[p];
        const ready = implemented?.includes(p);
        return (
          <div key={p} className="flex items-center justify-between p-4 gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: PLATFORM_INFO[p].color }} />
              {ch?.avatarUrl && <img src={ch.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover" />}
              <div className="min-w-0">
                <div className="text-sm font-bold text-foreground">{PLATFORM_INFO[p].label}</div>
                <div className="text-[11px] text-muted truncate">
                  {ch ? `@${ch.handle || ch.displayName || ch.externalId} · ${ch.status}${ch.lastPublishedAt ? ` · last post ${new Date(ch.lastPublishedAt).toLocaleDateString()}` : ""}${ch.lastError ? ` · ${ch.lastError}` : ""}` : ready ? "Not connected" : "Connector coming in a later milestone"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {ch && <button onClick={() => probe(ch)} disabled={busy === ch.id} className="px-3 py-2 rounded-lg border border-divider text-xs font-bold text-muted">Check</button>}
              {ch && <button onClick={() => disconnect(ch)} disabled={busy === ch.id} className="px-3 py-2 rounded-lg text-xs font-bold text-rose-500">Disconnect</button>}
              <a href={ready ? `/api/social/${p}/connect?actorId=${actor.id}` : undefined} className={`px-4 py-2 rounded-lg text-xs font-bold ${ready ? "bg-primary text-white" : "border border-divider text-muted pointer-events-none opacity-60"}`}>
                {ch ? "Reconnect" : "Connect"}
              </a>
            </div>
          </div>
        );
      })}
      <p className="p-4 text-[11px] text-muted">Each actor connects its own account. Developer-app credentials live in <Link href="/settings/platforms" className="text-primary font-bold">Settings → Platform apps</Link>. Until a platform is connected, its posts are skipped and can be downloaded from the calendar.</p>
    </div>
  );
}

function PostsTab({ actor, reload }) {
  const [planning, setPlanning] = useState(false);
  const plan = async () => {
    setPlanning(true);
    try {
      const res = await fetch(`/api/actors/${actor.id}/plan`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      toast.success(`Planned ${d.created} post(s) for ${d.date}`);
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setPlanning(false);
    }
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">{actor._count?.posts || 0} posts · open the <Link href="/calendar" className="text-primary font-bold">calendar</Link> to review and approve.</p>
        <button onClick={plan} disabled={planning || !actor.imageUrl} className="px-4 py-2 rounded-lg bg-primary text-white text-xs font-bold disabled:opacity-50 flex items-center gap-2">{planning ? <FiLoader className="animate-spin" /> : <FiCalendar />} Plan tomorrow now</button>
      </div>
      <div className="rounded-xl border border-divider bg-bg-card divide-y divide-divider">
        {(actor.posts || []).length === 0 && <div className="p-6 text-xs text-muted text-center">No posts yet.</div>}
        {(actor.posts || []).map((p) => (
          <Link key={p.id} href={`/calendar?post=${p.id}`} className="flex items-center gap-4 p-3 hover:bg-glass-hover">
            <div className="w-10 h-14 rounded bg-glass-hover overflow-hidden flex-shrink-0">{p.keyframeUrl && <img src={p.keyframeUrl} alt="" className="w-full h-full object-cover" />}</div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-foreground truncate">{p.hook || p.idea}</div>
              <div className="text-[11px] text-muted">{p.planDate} · {p.status} · {p.mediaType} {p.clipLengthSec}s · {(p.costCents / 100).toFixed(2)} USD</div>
            </div>
            <div className="flex gap-1">{p.targets.map((t) => <span key={t.id} className="w-2 h-2 rounded-full" style={{ background: PLATFORM_INFO[t.platform].color, opacity: t.status === "published" ? 1 : 0.35 }} />)}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function ActorDetail() {
  const { id } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") || "profile";
  const [actor, setActor] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () =>
    fetch(`/api/actors/${id}`)
      .then(async (r) => { if (!r.ok) throw new Error("Not found"); return r.json(); })
      .then(setActor)
      .catch(() => { toast.error("Actor not found"); router.push("/actors"); });
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const c = searchParams.get("connected");
    const e = searchParams.get("error");
    if (c) toast.success(`${c} connected`);
    if (e) toast.error(e);
  }, [searchParams]);

  // Refresh while identity is building.
  useEffect(() => {
    if (!actor || !["training", "generating_refs"].includes(actor.identityStatus)) return;
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [actor?.identityStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (patch) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/actors/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Save failed");
      toast.success("Saved");
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!actor) return <div className="h-full flex items-center justify-center"><FiLoader className="animate-spin text-primary text-2xl" /></div>;

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-10">
      <Toaster position="top-right" />
      <div className="max-w-5xl mx-auto space-y-6">
        <Link href="/actors" className="text-xs font-bold text-muted flex items-center gap-1 hover:text-foreground"><FiArrowLeft /> All actors</Link>
        <header className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-glass-hover overflow-hidden border border-divider">{actor.imageUrl && <img src={actor.imageUrl} alt="" className="w-full h-full object-cover" />}</div>
          <div className="flex-1">
            <h1 className="text-2xl font-black text-foreground flex items-center gap-3">{actor.name} <StatusPill status={actor.identityStatus} /></h1>
            <p className="text-xs text-muted">{actor.kind} · {actor.bible?.tagline || actor.bible?.niche || "no bible yet"}</p>
          </div>
        </header>
        <nav className="flex gap-1 border-b border-divider">
          {TABS.map((t) => (
            <Link key={t.id} href={`/actors/${id}?tab=${t.id}`} className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 -mb-px ${tab === t.id ? "border-primary text-primary" : "border-transparent text-muted hover:text-foreground"}`}>
              <t.icon /> {t.label}
            </Link>
          ))}
        </nav>
        {tab === "profile" && <ProfileTab key={actor.updatedAt} actor={actor} save={save} saving={saving} />}
        {tab === "identity" && <IdentityTab actor={actor} reload={load} />}
        {tab === "cadence" && <CadenceTab key={actor.updatedAt} actor={actor} save={save} saving={saving} />}
        {tab === "competitors" && <CompetitorsTab actor={actor} />}
        {tab === "channels" && <ChannelsTab actor={actor} reload={load} />}
        {tab === "posts" && <PostsTab actor={actor} reload={load} />}
      </div>
    </div>
  );
}

export default function ActorPage() {
  return (
    <Suspense fallback={<div className="h-full flex items-center justify-center"><FiLoader className="animate-spin text-primary text-2xl" /></div>}>
      <ActorDetail />
    </Suspense>
  );
}
