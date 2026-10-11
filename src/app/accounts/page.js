"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { upload } from "@vercel/blob/client";
import toast, { Toaster } from "react-hot-toast";
import { FiPlus, FiX, FiUpload, FiLoader, FiTrash2, FiBriefcase, FiRefreshCw, FiZap as FiZapIcon } from "react-icons/fi";
import { Field, inputCls, fmt, pct, when, PLATFORM_DOT } from "@/components/ui/form";

const EMPTY = { name: "", website: "", facebook: "", instagram: "", notes: "", imageUrl: "" };

export default function AccountsPage() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const load = () =>
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((d) => setAccounts(Array.isArray(d) ? d : []))
      .catch(() => toast.error("Could not load brand accounts"))
      .finally(() => setLoading(false));
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!accounts.some((a) => a.importStatus === "importing")) return;
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [accounts]);

  const onPickFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const blob = await upload(`brands/${file.name}`, file, { access: "public", handleUploadUrl: "/api/upload" });
      setEditing((a) => ({ ...a, imageUrl: blob.url }));
    } catch (err) {
      toast.error(`Upload failed: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const save = async (e) => {
    e.preventDefault();
    if (!editing.name?.trim()) return toast.error("Give the brand a name");
    setBusy(true);
    try {
      const res = await fetch("/api/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Save failed");
      toast.success("Brand added. Connect its channels next.");
      setEditing(null);
      window.location.href = `/accounts/${d.id}?tab=channels`;
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const [seeding, setSeeding] = useState(false);
  const seedApex = async () => {
    setSeeding(true);
    try {
      const res = await fetch("/api/ops/seed-apex", { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Seed failed");
      toast.success(`Apex Outdoor Rewards added with ${d.posts} posts`);
      window.location.href = `/accounts/${d.actorId}`;
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSeeding(false);
    }
  };

  const remove = async (a) => {
    if (!confirm(`Delete ${a.name} and its imported posts?`)) return;
    const res = await fetch(`/api/accounts/${a.id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Deleted"); setAccounts((x) => x.filter((y) => y.id !== a.id)); } else toast.error("Delete failed");
  };

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-12">
      <Toaster position="top-right" />
      <header className="max-w-7xl mx-auto mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-muted text-xs font-bold"><FiBriefcase /> Brand Accounts</div>
          <h1 className="text-2xl font-black text-foreground">Your brands</h1>
          <p className="text-muted text-xs leading-relaxed max-w-xl">Connect a real Facebook Page and Instagram account, import their history, score every post 1–10, learn the design system and get recommended posts that match it.</p>
        </div>
        <button onClick={() => setEditing({ ...EMPTY })} className="flex items-center gap-2 px-5 py-3 rounded-full bg-primary text-white font-bold text-sm shadow-xl shadow-primary/20 hover:bg-primary-hover"><FiPlus /> Add brand</button>
      </header>

      <div className="max-w-7xl mx-auto">
        {loading ? (
          <div className="py-32 flex justify-center"><FiLoader className="text-3xl text-primary animate-spin" /></div>
        ) : accounts.length === 0 ? (
          <div className="py-24 flex flex-col items-center text-center space-y-6">
            <div className="w-20 h-20 rounded-2xl bg-bg-card border border-divider flex items-center justify-center"><FiBriefcase className="text-3xl text-muted" /></div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-foreground">No brand accounts yet</h3>
              <p className="text-xs text-muted max-w-sm">Add a brand, connect Meta, and the import will pull every post with its likes, comments, shares, saves and reach.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={seedApex} disabled={seeding} className="px-6 py-3 rounded-full bg-primary text-white text-sm font-bold disabled:opacity-50 flex items-center gap-2">{seeding ? <FiLoader className="animate-spin" /> : <FiZapIcon />} Quick start: Apex Outdoor Rewards</button>
              <button onClick={() => setEditing({ ...EMPTY })} className="px-6 py-3 rounded-full border border-divider text-sm font-bold text-muted hover:text-foreground">Add another brand</button>
            </div>
            <p className="text-[11px] text-muted max-w-sm">Quick start loads the Facebook posts we transcribed from your screenshots (Aug 19 – Oct 9, 22K followers) and scores them. Connect Meta later and the real metrics merge in.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <AnimatePresence>
              {accounts.map((a, i) => (
                <motion.div key={a.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="group rounded-xl bg-bg-card border border-divider shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all p-5 space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-14 h-14 rounded-xl bg-glass-hover border border-divider overflow-hidden flex items-center justify-center flex-shrink-0">{a.imageUrl ? <img src={a.imageUrl} alt="" className="w-full h-full object-cover" /> : <FiBriefcase className="text-muted" />}</div>
                    <div className="flex-1 min-w-0">
                      <Link href={`/accounts/${a.id}`} className="text-base font-black text-foreground hover:text-primary block truncate">{a.name}</Link>
                      <div className="text-[11px] font-semibold text-primary truncate">{a.brandProfile?.category || "Brand"}</div>
                      <div className="flex items-center gap-2 mt-1">
                        {a.channels.map((c) => (
                          <span key={c.id} className="flex items-center gap-1 text-[10px] text-muted"><span className="w-2 h-2 rounded-full" style={{ background: PLATFORM_DOT[c.platform] }} />{c.handle || c.platform} · {fmt(c.followers)}</span>
                        ))}
                        {!a.channels.length && <span className="text-[10px] text-amber-600">No channels connected</span>}
                      </div>
                    </div>
                    <button onClick={() => remove(a)} className="opacity-0 group-hover:opacity-100 text-muted hover:text-rose-500" title="Delete"><FiTrash2 /></button>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-bg-page p-2"><div className="text-lg font-black text-foreground">{a._count.channelPosts}</div><div className="text-[10px] text-muted uppercase font-bold">posts</div></div>
                    <div className="rounded-lg bg-bg-page p-2"><div className="text-lg font-black text-foreground">{a.avgScore != null ? a.avgScore.toFixed(1) : "–"}</div><div className="text-[10px] text-muted uppercase font-bold">avg score</div></div>
                    <div className="rounded-lg bg-bg-page p-2"><div className="text-lg font-black text-foreground">{pct(a.avgER)}</div><div className="text-[10px] text-muted uppercase font-bold">avg ER</div></div>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted">
                    <span className="flex items-center gap-1">{a.importStatus === "importing" ? <><FiRefreshCw className="animate-spin" /> importing…</> : a.importStatus === "failed" ? <span className="text-rose-500">import failed</span> : a.lastImportAt ? `synced ${when(a.lastImportAt)}` : "not imported yet"}</span>
                    <Link href={`/accounts/${a.id}`} className="font-bold text-primary">Open →</Link>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <AnimatePresence>
        {editing && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => !busy && setEditing(null)} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <motion.form onSubmit={save} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} className="relative w-full max-w-xl bg-bg-card rounded-xl shadow-2xl border border-divider p-6 space-y-4 text-foreground">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-black">New brand account</h2>
                <button type="button" onClick={() => setEditing(null)} className="text-muted hover:text-foreground"><FiX /></button>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-xl bg-glass-hover border border-divider overflow-hidden flex items-center justify-center flex-shrink-0">{editing.imageUrl ? <img src={editing.imageUrl} alt="" className="w-full h-full object-cover" /> : <FiBriefcase className="text-muted" />}</div>
                <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="px-3 py-2 rounded-lg border border-divider text-xs font-bold flex items-center gap-2">{busy ? <FiLoader className="animate-spin" /> : <FiUpload />} Logo (optional)</button>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onPickFile} />
              </div>
              <Field label="Brand name"><input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. Apex Outdoor Rewards" className={inputCls} /></Field>
              <Field label="Website"><input value={editing.website} onChange={(e) => setEditing({ ...editing, website: e.target.value })} placeholder="https://fishing.apexoutdoorrewards.com" className={inputCls} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Facebook Page"><input value={editing.facebook} onChange={(e) => setEditing({ ...editing, facebook: e.target.value })} placeholder="facebook.com/ApexOutdoorRewards" className={inputCls} /></Field>
                <Field label="Instagram"><input value={editing.instagram} onChange={(e) => setEditing({ ...editing, instagram: e.target.value })} placeholder="@apex_outdoor_rewards" className={inputCls} /></Field>
              </div>
              <Field label="Notes (what the brand does, programs, audience)"><textarea rows={3} value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} className={`${inputCls} resize-none`} placeholder="Whitetail Challenge, Turkey Challenge, fishing rewards… hunters and anglers across the US" /></Field>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 rounded-lg border border-divider text-xs font-semibold text-muted">Cancel</button>
                <button type="submit" disabled={busy} className="px-5 py-2 rounded-lg bg-primary text-white text-xs font-bold disabled:opacity-50">{busy ? "Saving…" : "Create brand"}</button>
              </div>
            </motion.form>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
