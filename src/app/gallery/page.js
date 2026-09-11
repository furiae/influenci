"use client";

import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import { FiPlus, FiFilm, FiClock, FiAlertCircle, FiDownload, FiMaximize2, FiX, FiInfo, FiTrash2, FiRefreshCw } from "react-icons/fi";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast, { Toaster } from "react-hot-toast";

const ACTIVE = ["processing", "pending", "starting", "queued"];

export default function FinalVideos() {
  const { status } = useSession();
  const router = useRouter();
  const [creations, setCreations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login?callbackUrl=/gallery");
  }, [status, router]);

  const load = () =>
    fetch("/api/creations")
      .then((r) => r.json())
      .then((data) => setCreations(Array.isArray(data) ? data : []))
      .catch(() => toast.error("Could not load videos"))
      .finally(() => setLoading(false));
  useEffect(() => { if (status === "authenticated") load(); }, [status]);

  // Refresh in-flight jobs (each GET also polls the provider server-side).
  useEffect(() => {
    const pending = creations.filter((c) => ACTIVE.includes(c.status));
    if (!pending.length) return;
    const t = setInterval(async () => {
      const updates = await Promise.all(pending.map((c) => fetch(`/api/creations/${c.id}`).then((r) => (r.ok ? r.json() : null)).catch(() => null)));
      setCreations((prev) => prev.map((c) => updates.find((u) => u && u.id === c.id) || c));
    }, 6000);
    return () => clearInterval(t);
  }, [creations]);

  const remove = async (c) => {
    if (!confirm("Delete this video?")) return;
    const res = await fetch(`/api/creations/${c.id}`, { method: "DELETE" });
    if (res.ok) { setCreations((p) => p.filter((x) => x.id !== c.id)); setSelected(null); toast.success("Deleted"); }
    else toast.error("Delete failed");
  };

  if (status !== "authenticated") return null;

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-12">
      <Toaster position="top-right" />
      <header className="max-w-7xl mx-auto mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-muted text-xs font-bold"><FiFilm /> Final Videos</div>
          <h1 className="text-2xl font-black text-foreground">Your renders</h1>
          <p className="text-muted text-xs leading-relaxed max-w-xl">Every clip you generate lands here. Provider links can expire after a while, so download the ones you want to keep.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setLoading(true); load(); }} className="flex items-center gap-2 px-4 py-3 rounded-full border border-divider text-sm font-bold text-muted hover:text-foreground"><FiRefreshCw /> Refresh</button>
          <button onClick={() => router.push("/")} className="flex items-center gap-2 px-5 py-3 rounded-full bg-primary text-white font-bold text-sm shadow-xl shadow-primary/20 hover:bg-primary-hover"><FiPlus /> New video</button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto">
        {loading ? (
          <div className="py-32 flex justify-center"><FiClock className="text-3xl text-primary animate-spin" /></div>
        ) : creations.length === 0 ? (
          <div className="py-24 flex flex-col items-center text-center space-y-6">
            <div className="w-20 h-20 rounded-2xl bg-bg-card border border-divider flex items-center justify-center"><FiFilm className="text-3xl text-muted" /></div>
            <h3 className="text-lg font-bold text-foreground">Nothing rendered yet</h3>
            <button onClick={() => router.push("/")} className="px-6 py-3 rounded-full bg-primary text-white text-sm font-bold">Open the Ad Builder</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            <AnimatePresence>
              {creations.map((item, i) => (
                <motion.div key={item.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                  className="group relative rounded-xl bg-bg-card border border-divider aspect-[3/4] cursor-pointer overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all"
                  onClick={() => setSelected(item)}>
                  {item.status === "completed" ? (
                    <video src={item.url} className="w-full h-full object-cover" muted loop playsInline onMouseOver={(e) => e.target.play()} onMouseOut={(e) => e.target.pause()} />
                  ) : item.status === "failed" ? (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-rose-500/5"><FiAlertCircle className="text-rose-500 text-2xl" /><span className="text-xs font-bold text-rose-500">Failed</span></div>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-glass-hover"><FiClock className="text-2xl text-primary animate-spin" /><span className="text-xs font-medium text-muted animate-pulse">Rendering…</span></div>
                  )}
                  {item.actor && <img src={item.actor.imageUrl} alt="" className="absolute top-3 left-3 w-8 h-8 rounded-full object-cover border-2 border-white shadow" title={item.actor.name} />}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all p-5 flex flex-col justify-end">
                    <p className="text-white text-xs font-bold leading-tight line-clamp-2 mb-2">{item.prompt}</p>
                    <div className="flex items-center justify-between text-[10px] text-white/80"><span>{item.modelId?.split("/")[1] || item.modelId}</span><FiMaximize2 /></div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <AnimatePresence>
        {selected && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[1000] bg-black/80 backdrop-blur-sm p-4 md:p-10 flex items-center justify-center" onClick={() => setSelected(null)}>
            <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="relative max-w-5xl w-full max-h-full bg-bg-card rounded-xl border border-divider overflow-hidden flex flex-col md:flex-row shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="w-full md:w-[60%] bg-black flex items-center justify-center min-h-[40vh]">
                {selected.status === "completed" ? (
                  <video src={selected.url} className="max-h-[80vh] w-full object-contain" controls autoPlay loop playsInline />
                ) : selected.status === "failed" ? (
                  <div className="p-8 text-center space-y-2"><FiAlertCircle className="text-rose-500 text-5xl mx-auto" /><p className="text-sm font-bold text-rose-400">Render failed</p><p className="text-xs text-white/60 max-w-sm">{selected.error}</p></div>
                ) : (
                  <div className="p-8 text-center space-y-3"><FiClock className="text-5xl text-primary animate-spin mx-auto" /><p className="text-xs text-white/60">Still rendering…</p></div>
                )}
              </div>
              <div className="w-full md:w-[40%] p-6 flex flex-col overflow-y-auto custom-scrollbar text-foreground">
                <div className="flex-1 space-y-6">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-muted text-xs"><FiInfo /> Script / prompt</div>
                    <p className="text-sm leading-relaxed">{selected.prompt}</p>
                  </div>
                  <dl className="grid grid-cols-2 gap-4 pt-4 border-t border-divider text-xs">
                    <div><dt className="text-muted">Model</dt><dd className="font-bold">{selected.modelId}</dd></div>
                    <div><dt className="text-muted">Actor</dt><dd className="font-bold">{selected.actor?.name || "—"}</dd></div>
                    <div><dt className="text-muted">Length</dt><dd className="font-bold">{selected.duration ? `${selected.duration}s` : "—"}</dd></div>
                    <div><dt className="text-muted">Resolution</dt><dd className="font-bold">{selected.resolution || selected.aspectRatio || "—"}</dd></div>
                    <div><dt className="text-muted">Credits</dt><dd className="font-bold">{selected.meta?.credits ?? 0}</dd></div>
                    <div><dt className="text-muted">Created</dt><dd className="font-bold">{new Date(selected.createdAt).toLocaleString()}</dd></div>
                  </dl>
                  {selected.inputImages?.length > 0 && (
                    <div className="space-y-2 pt-4 border-t border-divider">
                      <div className="text-xs text-muted">Reference images</div>
                      <div className="grid grid-cols-4 gap-2">{selected.inputImages.map((img, i) => <img key={i} src={img} alt="" className="aspect-square rounded-md object-cover border border-divider" />)}</div>
                    </div>
                  )}
                </div>
                <div className="pt-6 flex gap-2">
                  {selected.url && (
                    <a href={selected.url} download target="_blank" rel="noopener noreferrer" className="flex-1 py-3 bg-primary text-white rounded-full font-bold text-xs flex items-center justify-center gap-2 hover:bg-primary-hover"><FiDownload /> Download</a>
                  )}
                  <button onClick={() => remove(selected)} className="px-4 py-3 rounded-full border border-divider text-rose-500 hover:bg-rose-500/10"><FiTrash2 /></button>
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/40 text-white flex items-center justify-center"><FiX /></button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
