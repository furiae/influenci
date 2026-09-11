"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { upload } from "@vercel/blob/client";
import toast, { Toaster } from "react-hot-toast";
import Link from "next/link";
import { FiPlus, FiX, FiUpload, FiLoader, FiTrash2, FiVideo, FiUsers, FiEdit2, FiZap, FiSettings } from "react-icons/fi";

const GENDERS = ["female", "male", "non-binary"];
const AGES = ["18-24", "25-35", "36-50", "50+"];

export default function ActorsPage() {
  const router = useRouter();
  const [actors, setActors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | {} (new) | actor
  const [busy, setBusy] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const fileRef = useRef(null);

  const seed = async () => {
    setSeeding(true);
    try {
      const res = await fetch("/api/actors/seed", { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      toast.success(d.created.length ? `Created ${d.created.length} personas` : "Personas already exist");
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSeeding(false);
    }
  };

  const load = () =>
    fetch("/api/actors")
      .then((r) => r.json())
      .then((data) => setActors(Array.isArray(data) ? data : []))
      .catch(() => toast.error("Could not load actors"))
      .finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const onPickFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const blob = await upload(`actors/${file.name}`, file, { access: "public", handleUploadUrl: "/api/upload" });
      setEditing((a) => ({ ...a, imageUrl: blob.url }));
    } catch (err) {
      toast.error(`Upload failed: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const save = async (e) => {
    e.preventDefault();
    if (!editing.name?.trim()) return toast.error("Give the actor a name");
    if (!editing.imageUrl) return toast.error("Upload a reference photo");
    setBusy(true);
    try {
      const isNew = !editing.id;
      const res = await fetch(isNew ? "/api/actors" : `/api/actors/${editing.id}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editing.name, imageUrl: editing.imageUrl, gender: editing.gender || null, ageRange: editing.ageRange || null, notes: editing.notes || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      toast.success(isNew ? "Actor created" : "Actor updated");
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (actor) => {
    if (!confirm(`Delete ${actor.name}? Videos made with them are kept.`)) return;
    const res = await fetch(`/api/actors/${actor.id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Deleted"); setActors((a) => a.filter((x) => x.id !== actor.id)); }
    else toast.error("Delete failed");
  };

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-12">
      <Toaster position="top-right" />
      <header className="max-w-7xl mx-auto mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-muted text-xs font-bold"><FiUsers /> AI Actors</div>
          <h1 className="text-2xl font-black text-foreground">Your cast</h1>
          <p className="text-muted text-xs leading-relaxed max-w-xl">
            Save a reference photo once and reuse the same face across every ad. Upload a photo of a consenting person, a licensed stock face, or an AI-generated portrait.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={seed} disabled={seeding} className="flex items-center gap-2 px-4 py-3 rounded-full border border-divider text-sm font-bold text-muted hover:text-foreground disabled:opacity-50">
            {seeding ? <FiLoader className="animate-spin" /> : <FiZap />} Seed the 7 personas
          </button>
          <button onClick={() => setEditing({ name: "", imageUrl: "", gender: "female", ageRange: "25-35", notes: "" })} className="flex items-center gap-2 px-5 py-3 rounded-full bg-primary text-white font-bold text-sm shadow-xl shadow-primary/20 hover:bg-primary-hover">
            <FiPlus /> New actor
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto">
        {loading ? (
          <div className="py-32 flex justify-center"><FiLoader className="text-3xl text-primary animate-spin" /></div>
        ) : actors.length === 0 ? (
          <div className="py-24 flex flex-col items-center text-center space-y-6">
            <div className="w-20 h-20 rounded-2xl bg-bg-card border border-divider flex items-center justify-center"><FiUsers className="text-3xl text-muted" /></div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-foreground">No actors yet</h3>
              <p className="text-xs text-muted max-w-sm">Create your first actor from a photo. You can then pick them in the Ad Builder for image-to-video and talking clips.</p>
            </div>
            <button onClick={() => setEditing({ name: "", imageUrl: "", gender: "female", ageRange: "25-35", notes: "" })} className="px-6 py-3 rounded-full bg-primary text-white text-sm font-bold">Create actor</button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
            <AnimatePresence>
              {actors.map((a, i) => (
                <motion.div key={a.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="group rounded-xl overflow-hidden bg-bg-card border border-divider shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all">
                  <div className="aspect-[3/4] bg-glass-hover relative">
                    {a.imageUrl ? <img src={a.imageUrl} alt={a.name} className="w-full h-full object-cover" /> : <Link href={`/actors/${a.id}?tab=identity`} className="absolute inset-0 flex flex-col items-center justify-center text-muted text-xs gap-2"><FiUpload className="text-2xl" /> Add a reference photo</Link>}
                    {a.identityStatus && a.identityStatus !== "none" && <span className={`absolute top-2 left-2 text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${a.identityStatus === "ready" ? "bg-emerald-500 text-white" : a.identityStatus === "failed" ? "bg-rose-500 text-white" : "bg-amber-400 text-black"}`}>{a.identityStatus === "ready" ? "identity locked" : a.identityStatus}</span>}
                    <div className="absolute inset-x-0 bottom-0 p-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-t from-black/70 to-transparent">
                      <button onClick={() => router.push(`/?actor=${a.id}`)} className="flex-1 flex items-center justify-center gap-1 text-[11px] font-bold py-2 rounded-full bg-primary text-white"><FiVideo /> Use in ad</button>
                      <Link href={`/actors/${a.id}`} className="w-8 h-8 rounded-full bg-white/20 backdrop-blur text-white flex items-center justify-center" title="Open"><FiSettings size={12} /></Link>
                      <button onClick={() => setEditing(a)} className="w-8 h-8 rounded-full bg-white/20 backdrop-blur text-white flex items-center justify-center" title="Quick edit"><FiEdit2 size={12} /></button>
                      <button onClick={() => remove(a)} className="w-8 h-8 rounded-full bg-white/20 backdrop-blur text-white flex items-center justify-center hover:bg-rose-500" title="Delete"><FiTrash2 size={12} /></button>
                    </div>
                  </div>
                  <div className="p-3">
                    <Link href={`/actors/${a.id}`} className="text-sm font-bold text-foreground truncate hover:text-primary block">{a.name}</Link>
                    <div className="text-[11px] text-muted">{[a.gender, a.ageRange].filter(Boolean).join(" · ") || "Actor"}{a._count?.creations ? ` · ${a._count.creations} video${a._count.creations === 1 ? "" : "s"}` : ""}</div>
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
            <motion.form onSubmit={save} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} className="relative w-full max-w-2xl bg-bg-card rounded-xl shadow-2xl border border-divider overflow-hidden grid grid-cols-1 md:grid-cols-5">
              <div className="md:col-span-2 bg-glass-hover aspect-[3/4] md:aspect-auto relative flex items-center justify-center">
                {editing.imageUrl ? <img src={editing.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" /> : <div className="text-center text-muted text-xs p-6"><FiUpload className="mx-auto text-2xl mb-2" />Front-facing photo, good light, shoulders up.</div>}
                <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="absolute bottom-3 left-3 right-3 py-2 rounded-full bg-black/60 backdrop-blur text-white text-xs font-bold flex items-center justify-center gap-2">
                  {busy ? <FiLoader className="animate-spin" /> : <FiUpload />} {editing.imageUrl ? "Replace photo" : "Upload photo"}
                </button>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onPickFile} />
              </div>
              <div className="md:col-span-3 p-6 space-y-4 text-foreground">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-black">{editing.id ? "Edit actor" : "New actor"}</h2>
                  <button type="button" onClick={() => setEditing(null)} className="text-muted hover:text-foreground"><FiX /></button>
                </div>
                <label className="block space-y-1">
                  <span className="text-[11px] uppercase font-bold text-muted tracking-wider">Name</span>
                  <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. Maya" className="w-full bg-bg-page border border-divider rounded-lg px-3 py-2.5 text-sm outline-none focus:border-primary" />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block space-y-1">
                    <span className="text-[11px] uppercase font-bold text-muted tracking-wider">Gender</span>
                    <select value={editing.gender || ""} onChange={(e) => setEditing({ ...editing, gender: e.target.value })} className="w-full bg-bg-page border border-divider rounded-lg px-3 py-2.5 text-sm">
                      <option value="">—</option>{GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </label>
                  <label className="block space-y-1">
                    <span className="text-[11px] uppercase font-bold text-muted tracking-wider">Age</span>
                    <select value={editing.ageRange || ""} onChange={(e) => setEditing({ ...editing, ageRange: e.target.value })} className="w-full bg-bg-page border border-divider rounded-lg px-3 py-2.5 text-sm">
                      <option value="">—</option>{AGES.map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </label>
                </div>
                <label className="block space-y-1">
                  <span className="text-[11px] uppercase font-bold text-muted tracking-wider">Notes (optional)</span>
                  <textarea value={editing.notes || ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} rows={3} placeholder="Wardrobe, vibe, brand, setting…" className="w-full bg-bg-page border border-divider rounded-lg px-3 py-2.5 text-sm outline-none focus:border-primary resize-none" />
                </label>
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 rounded-lg border border-divider text-xs font-semibold text-muted">Cancel</button>
                  <button type="submit" disabled={busy} className="px-5 py-2 rounded-lg bg-primary text-white text-xs font-bold disabled:opacity-50">{busy ? "Saving…" : editing.id ? "Save changes" : "Create actor"}</button>
                </div>
              </div>
            </motion.form>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
