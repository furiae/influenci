"use client";

import { useSession } from "next-auth/react";
import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { upload } from "@vercel/blob/client";
import toast, { Toaster } from "react-hot-toast";
import {
  FiArrowUp, FiX, FiSearch, FiChevronDown, FiImage, FiPlus, FiLoader, FiTrash2,
  FiUser, FiAlertCircle, FiVideo, FiMic, FiType, FiKey, FiZap, FiDownload,
} from "react-icons/fi";
import { FaCoins } from "react-icons/fa";
import { estimateCredits, estimateSpeechSeconds } from "@/lib/credits";

const ACTIVE = ["processing", "pending", "starting", "queued"];
const KIND_ICON = { i2v: FiVideo, t2v: FiType, lipsync: FiMic };
const KIND_LABEL = { i2v: "Image → video", t2v: "Text → video", lipsync: "Talking actor" };

function Dropdown({ label, value, options, labels, onChange, unit = "" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const show = (v) => (labels && labels[v]) || `${v}${unit}`;
  return (
    <div ref={ref} className="relative" onBlur={(e) => { if (!ref.current?.contains(e.relatedTarget)) setOpen(false); }}>
      <button onClick={() => setOpen(!open)} className={`flex items-center gap-1.5 px-3 py-1 rounded transition-all hover:bg-glass-hover ${open ? "bg-glass-hover" : ""}`}>
        <span className="text-xs font-medium text-muted capitalize">{label}</span>
        <span className="text-xs font-semibold text-foreground">{show(value)}</span>
        <FiChevronDown className={`text-xs text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-2 min-w-[8rem] bg-bg-card border border-divider rounded shadow-2xl z-[10000] max-h-64 overflow-y-auto custom-scrollbar">
          {options.map((opt) => (
            <button key={String(opt)} onClick={() => { onChange(opt); setOpen(false); }}
              className={`w-full text-left px-4 py-2 text-xs font-bold hover:bg-glass-hover transition-colors whitespace-nowrap ${opt === value ? "text-primary" : "text-muted"}`}>
              {show(opt)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Range({ label, value, min, max, unit = "", onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  return (
    <div ref={ref} className="relative" onBlur={(e) => { if (!ref.current?.contains(e.relatedTarget)) setOpen(false); }}>
      <button onClick={() => setOpen(!open)} className={`flex items-center gap-1.5 px-3 py-1 rounded transition-all hover:bg-glass-hover ${open ? "bg-glass-hover" : ""}`}>
        <span className="text-xs font-medium text-muted">{label}</span>
        <span className="text-xs font-semibold text-foreground">{value}{unit}</span>
        <FiChevronDown className={`text-xs text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute bottom-full right-0 mb-2 w-56 bg-bg-card border border-divider rounded shadow-2xl p-5 z-[10000]">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-medium text-muted">{label}</span>
            <span className="text-xs font-semibold text-foreground">{value}{unit}</span>
          </div>
          <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(parseInt(e.target.value, 10))} className="w-full h-1.5 bg-divider rounded-full appearance-none cursor-pointer accent-primary" />
        </div>
      )}
    </div>
  );
}

function AdBuilder() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileInputRef = useRef(null);

  const [catalog, setCatalog] = useState(null);
  const [selectedModel, setSelectedModel] = useState(null);
  const [settings, setSettings] = useState({});
  const [actors, setActors] = useState([]);
  const [selectedActor, setSelectedActor] = useState(null);
  const [uploaded, setUploaded] = useState([]);
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastGeneration, setLastGeneration] = useState(null);
  const [modelsOpen, setModelsOpen] = useState(false);
  const [actorsOpen, setActorsOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState("");

  const selectModel = (m) => {
    setSelectedModel(m);
    const defaults = {};
    if (m?.params) for (const [k, p] of Object.entries(m.params)) defaults[k] = p.default;
    setSettings(defaults);
  };

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login?callbackUrl=/");
  }, [status, router]);

  // Model catalog
  useEffect(() => {
    fetch("/api/models")
      .then((r) => r.json())
      .then((d) => {
        setCatalog(d);
        const all = d.providers.flatMap((p) => p.models.map((m) => ({ ...m, providerLabel: p.label, configured: p.configured })));
        const preferred = all.find((m) => m.provider === d.defaultProvider && m.kind === "i2v") || all[0];
        selectModel(preferred);
      })
      .catch(() => toast.error("Could not load models"));
  }, []);

  // Actors (+ preselect from ?actor=)
  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/actors")
      .then((r) => r.json())
      .then((list) => {
        setActors(Array.isArray(list) ? list : []);
        const wanted = searchParams.get("actor");
        if (wanted) {
          const a = list.find((x) => x.id === wanted);
          if (a) setSelectedActor(a);
        }
      })
      .catch(() => {});
  }, [status, searchParams]);

  // Poll the latest job
  useEffect(() => {
    if (!lastGeneration || !ACTIVE.includes(lastGeneration.status)) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/creations/${lastGeneration.id}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.status !== lastGeneration.status || data.url) setLastGeneration(data);
      } catch (err) {
        console.error("poll", err);
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [lastGeneration]);

  const allModels = useMemo(
    () => (catalog ? catalog.providers.flatMap((p) => p.models.map((m) => ({ ...m, providerLabel: p.label, configured: p.configured, allowUserKey: p.allowUserKey }))) : []),
    [catalog]
  );
  const hasKeys = session?.user?.hasKeys || {};
  const modelUsable = (m) => m.configured || hasKeys[m.provider];
  const cost = selectedModel && !hasKeys[selectedModel.provider] ? estimateCredits(selectedModel, settings, prompt) : 0;
  const needsImage = selectedModel && selectedModel.kind !== "t2v";
  const images = [...(selectedActor ? [selectedActor.imageUrl] : []), ...uploaded.filter((i) => i.status === "ready").map((i) => i.url)];

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (uploaded.length + files.length > 6) return toast.error("Up to 6 reference images");
    const items = files.map((file) => ({ id: Math.random().toString(36).slice(2), file, preview: URL.createObjectURL(file), status: "uploading" }));
    setUploaded((prev) => [...prev, ...items]);
    for (const item of items) {
      try {
        const blob = await upload(`refs/${item.file.name}`, item.file, { access: "public", handleUploadUrl: "/api/upload" });
        setUploaded((prev) => prev.map((p) => (p.id === item.id ? { ...p, status: "ready", url: blob.url } : p)));
      } catch (err) {
        console.error(err);
        toast.error(`Upload failed: ${err.message}`);
        setUploaded((prev) => prev.filter((p) => p.id !== item.id));
      }
    }
  };

  const handleGenerate = async () => {
    if (!selectedModel || !prompt.trim()) return;
    if (uploaded.some((i) => i.status === "uploading")) return toast.error("Wait for uploads to finish");
    if (needsImage && images.length === 0) return toast.error("Pick an actor or upload a reference image");
    setIsGenerating(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId: selectedModel.id, prompt, settings, images: uploaded.filter((i) => i.status === "ready").map((i) => i.url), actorId: selectedActor?.id || null }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Generation failed");
      setLastGeneration({ id: data.creationId, status: "processing", prompt, modelId: selectedModel.id });
      toast.success(selectedModel.free ? "Queued on the community GPU. This can take a few minutes." : "Rendering…");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const update = (k, v) => setSettings((s) => ({ ...s, [k]: v }));

  if (status === "loading" || !catalog) {
    return <div className="h-full w-full flex items-center justify-center"><FiLoader className="w-6 h-6 animate-spin text-muted" /></div>;
  }
  if (status !== "authenticated") return null;

  const KindIcon = selectedModel ? KIND_ICON[selectedModel.kind] || FiVideo : FiVideo;
  const filteredModels = allModels.filter((m) => !modelSearch || `${m.name} ${m.providerLabel} ${m.description}`.toLowerCase().includes(modelSearch.toLowerCase()));

  return (
    <div className="h-full flex flex-col relative overflow-hidden">
      <Toaster position="top-right" />
      <main className="flex-1 flex flex-col relative min-h-0">
        {/* Canvas */}
        <div className="flex-1 p-6 relative flex flex-col items-center justify-center overflow-hidden">
          <AnimatePresence mode="wait">
            {!lastGeneration ? (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center text-center space-y-5 max-w-md">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary"><FiZap className="text-2xl" /></div>
                <h1 className="text-xl font-black text-foreground">Ad Builder</h1>
                <p className="text-muted text-xs font-medium leading-relaxed">
                  Pick an <Link href="/actors" className="text-primary font-bold hover:underline">AI actor</Link>, choose a model, and write the script or scene.
                  Image-to-video models animate the actor photo; talking-actor models make them speak the script.
                </p>
                {actors.length === 0 && (
                  <Link href="/actors" className="text-xs font-bold px-4 py-2 rounded-full bg-primary text-white shadow-md shadow-primary/20 hover:bg-primary-hover">Create your first actor</Link>
                )}
              </motion.div>
            ) : (
              <motion.div key={lastGeneration.id} initial={{ opacity: 0, scale: 0.95, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                className="relative w-full max-w-md aspect-[9/16] max-h-[62vh] bg-bg-card rounded-xl border border-divider shadow-2xl overflow-hidden flex items-center justify-center">
                {ACTIVE.includes(lastGeneration.status) ? (
                  <div className="flex flex-col items-center gap-4 p-8 text-center">
                    <div className="w-12 h-12 border-4 border-divider border-t-primary rounded-full animate-spin" />
                    <span className="text-[10px] font-black text-muted uppercase tracking-[0.3em] animate-pulse">Rendering…</span>
                    {lastGeneration.modelId?.startsWith("zerogpu/") && <p className="text-[10px] text-muted">Community GPU queue. Several minutes is normal; you can leave and check Final Videos later.</p>}
                  </div>
                ) : lastGeneration.status === "failed" ? (
                  <div className="flex flex-col items-center gap-4 p-8 text-center">
                    <FiAlertCircle className="text-rose-500 text-4xl" />
                    <h3 className="text-sm font-bold text-foreground uppercase tracking-widest">Failed</h3>
                    <p className="text-[11px] text-muted leading-relaxed">{lastGeneration.error || "Unknown error"}</p>
                    <p className="text-[10px] text-muted">Credits for this job were returned.</p>
                  </div>
                ) : (
                  <video src={lastGeneration.url} className="w-full h-full object-contain bg-black" autoPlay loop playsInline controls />
                )}
                <button onClick={() => setLastGeneration(null)} className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/30 hover:bg-black/50 backdrop-blur text-white flex items-center justify-center"><FiX /></button>
                {lastGeneration.url && (
                  <a href={lastGeneration.url} target="_blank" rel="noopener noreferrer" className="absolute top-3 left-3 z-10 w-8 h-8 rounded-full bg-black/30 hover:bg-black/50 backdrop-blur text-white flex items-center justify-center" title="Open / download"><FiDownload /></a>
                )}
                <div className="absolute bottom-0 left-0 right-0 p-5 bg-gradient-to-t from-black/70 to-transparent text-white pointer-events-none">
                  <p className="text-[10px] uppercase tracking-widest opacity-80 mb-1">Latest result</p>
                  <p className="text-xs font-bold truncate">{lastGeneration.prompt}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Composer */}
        <div className="p-4 flex-shrink-0 flex flex-col items-center">
          <div className="w-full max-w-4xl bg-bg-card rounded-xl border border-divider shadow-2xl relative">
            {/* Actor + references strip */}
            <div className="flex items-center gap-3 p-3 border-b border-divider/60 overflow-x-auto no-scrollbar">
              <button onClick={() => setActorsOpen(true)} className={`flex items-center gap-2 pl-1 pr-3 py-1 rounded-full border text-xs font-bold transition-colors flex-shrink-0 ${selectedActor ? "border-primary/40 bg-primary/5 text-foreground" : "border-dashed border-divider text-muted hover:text-foreground"}`}>
                {selectedActor ? <img src={selectedActor.imageUrl} alt="" className="w-7 h-7 rounded-full object-cover" /> : <span className="w-7 h-7 rounded-full bg-glass-hover flex items-center justify-center"><FiUser /></span>}
                <span>{selectedActor ? selectedActor.name : "Choose actor"}</span>
                {selectedActor && <FiX className="text-muted hover:text-rose-500" onClick={(e) => { e.stopPropagation(); setSelectedActor(null); }} />}
              </button>
              <div className="w-px h-6 bg-divider" />
              {uploaded.map((img) => (
                <div key={img.id} className="relative group flex-shrink-0">
                  <img src={img.preview} alt="" className={`w-9 h-9 rounded-md object-cover border border-divider ${img.status === "uploading" ? "opacity-40" : ""}`} />
                  {img.status === "uploading" && <FiLoader className="absolute inset-0 m-auto text-primary animate-spin" />}
                  <button onClick={() => setUploaded((p) => p.filter((x) => x.id !== img.id))} className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 rounded-md"><FiTrash2 className="text-white text-xs" /></button>
                </div>
              ))}
              <button onClick={() => fileInputRef.current?.click()} className="w-9 h-9 rounded-md border-2 border-dashed border-divider flex items-center justify-center text-muted hover:text-foreground hover:border-primary/50 flex-shrink-0" title="Add product / scene reference">
                <FiPlus />
              </button>
              <span className="text-[10px] text-muted whitespace-nowrap">product or scene references (optional)</span>
              <input type="file" ref={fileInputRef} onChange={handleUpload} multiple accept="image/jpeg,image/png,image/webp" className="hidden" />
            </div>

            <div className="p-4 flex items-start gap-2">
              <FiImage className="text-muted mt-1" />
              <textarea
                value={prompt}
                onChange={(e) => { setPrompt(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${e.target.scrollHeight}px`; }}
                placeholder={selectedModel?.kind === "lipsync" ? "Write the script your actor will say…" : "Describe the scene and what the actor does…"}
                className="w-full bg-transparent border-none outline-none text-sm font-medium text-foreground placeholder-muted resize-none max-h-[160px] overflow-y-auto no-scrollbar"
                rows={2}
              />
            </div>

            <div className="flex items-center justify-between gap-2 px-3 py-3 border-t border-divider/60 flex-wrap">
              <div className="flex items-center gap-1 flex-wrap">
                <button onClick={() => setModelsOpen(true)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-divider hover:bg-glass-hover transition-colors">
                  <KindIcon className="text-xs text-primary" />
                  <span className="text-xs font-semibold text-foreground">{selectedModel?.name || "Choose model"}</span>
                  {selectedModel?.free && <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600">free</span>}
                </button>
                <div className="w-px h-4 bg-divider mx-1" />
                {selectedModel?.params && Object.entries(selectedModel.params).map(([key, p]) => {
                  if (p.min !== undefined) return <Range key={key} label="Length" value={settings[key] ?? p.default} min={p.min} max={p.max} unit="s" onChange={(v) => update(key, v)} />;
                  if (p.options?.length > 1) return <Dropdown key={key} label={key.replace("_", " ")} value={settings[key] ?? p.default} options={p.options} labels={p.labels} unit={key === "duration" ? "s" : ""} onChange={(v) => update(key, v)} />;
                  return null;
                })}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-3 py-1.5 border border-divider rounded-full" title={selectedModel?.kind === "lipsync" ? `~${estimateSpeechSeconds(prompt)}s of speech` : ""}>
                  <FaCoins className="text-yellow-500 text-xs" />
                  <span className="text-[10px] font-bold text-muted">{cost === 0 ? (selectedModel?.free ? "Free" : hasKeys[selectedModel?.provider] ? "Your key" : "0") : `${cost} credits`}</span>
                </div>
                <button onClick={handleGenerate} disabled={isGenerating || !prompt.trim() || !selectedModel || !modelUsable(selectedModel)}
                  className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/20 hover:bg-primary-hover transition-all disabled:opacity-50 disabled:cursor-not-allowed" title="Generate">
                  {isGenerating ? <FiLoader className="animate-spin" /> : <FiArrowUp className="text-lg" />}
                </button>
              </div>
            </div>
            {selectedModel && !modelUsable(selectedModel) && (
              <div className="px-4 pb-3 text-[11px] text-amber-600 flex items-center gap-2"><FiKey /> {selectedModel.providerLabel} has no key on this server. Add your own key from the top-right menu, or pick another model.</div>
            )}
          </div>
        </div>

        {/* Actor picker */}
        <AnimatePresence>
          {actorsOpen && (
            <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setActorsOpen(false)} className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
              <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} className="relative w-full max-w-3xl max-h-[80vh] bg-bg-card rounded-xl shadow-2xl flex flex-col overflow-hidden border border-divider">
                <div className="p-5 border-b border-divider/60 flex items-center justify-between">
                  <div><h2 className="text-sm font-black text-foreground">Choose an AI actor</h2><p className="text-[11px] text-muted">The actor photo becomes the first frame of the video.</p></div>
                  <Link href="/actors" className="text-xs font-bold px-3 py-1.5 rounded-full bg-primary text-white">Manage actors</Link>
                </div>
                <div className="p-5 overflow-y-auto custom-scrollbar">
                  {actors.length === 0 ? (
                    <div className="text-center py-10 text-xs text-muted">No actors yet. <Link href="/actors" className="text-primary font-bold">Create one</Link>.</div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                      {actors.map((a) => (
                        <button key={a.id} onClick={() => { setSelectedActor(a); setActorsOpen(false); }} className={`text-left rounded-lg overflow-hidden border transition-all hover:-translate-y-0.5 hover:shadow-lg ${selectedActor?.id === a.id ? "border-primary ring-1 ring-primary" : "border-divider"}`}>
                          <div className="aspect-[3/4] bg-glass-hover"><img src={a.imageUrl} alt={a.name} className="w-full h-full object-cover" /></div>
                          <div className="p-2"><div className="text-xs font-bold text-foreground truncate">{a.name}</div><div className="text-[10px] text-muted">{[a.gender, a.ageRange].filter(Boolean).join(" · ") || "Actor"}</div></div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Model picker */}
        <AnimatePresence>
          {modelsOpen && (
            <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setModelsOpen(false)} className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
              <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} className="relative w-full max-w-5xl max-h-[85vh] bg-bg-card rounded-xl shadow-2xl flex flex-col overflow-hidden border border-divider">
                <div className="p-5 border-b border-divider/60 flex items-center gap-4">
                  <div className="relative flex-1">
                    <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
                    <input value={modelSearch} onChange={(e) => setModelSearch(e.target.value)} placeholder="Search models…" className="w-full pl-11 pr-4 py-2 bg-bg-page border border-divider rounded-lg text-xs font-semibold outline-none focus:border-primary" />
                  </div>
                  <button onClick={() => setModelsOpen(false)} className="p-2 hover:bg-glass-hover rounded-full"><FiX className="text-xl text-muted" /></button>
                </div>
                <div className="p-5 overflow-y-auto custom-scrollbar space-y-6">
                  {catalog.providers.map((p) => {
                    const models = filteredModels.filter((m) => m.provider === p.id);
                    if (!models.length) return null;
                    return (
                      <section key={p.id}>
                        <div className="flex items-center gap-2 mb-3">
                          <h3 className="text-xs font-black uppercase tracking-widest text-foreground">{p.label}</h3>
                          {!p.configured && !hasKeys[p.id] && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600">needs your key</span>}
                          {hasKeys[p.id] && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600">your key</span>}
                        </div>
                        <p className="text-[11px] text-muted mb-3">{p.description}</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {models.map((m) => {
                            const Icon = KIND_ICON[m.kind] || FiVideo;
                            const active = selectedModel?.id === m.id;
                            return (
                              <button key={m.id} onClick={() => { selectModel(m); setModelsOpen(false); }}
                                className={`text-left p-4 rounded-lg border transition-all space-y-2 ${active ? "border-primary ring-1 ring-primary bg-primary/5" : "border-divider hover:border-primary/40 hover:shadow-md"}`}>
                                <div className="flex items-center justify-between">
                                  <div className={`w-8 h-8 rounded flex items-center justify-center ${active ? "bg-primary text-white" : "bg-glass-hover text-muted"}`}><Icon /></div>
                                  <span className="text-[9px] font-bold uppercase text-muted">{KIND_LABEL[m.kind]}</span>
                                </div>
                                <div className="text-xs font-bold text-foreground">{m.name}</div>
                                <p className="text-[11px] text-muted leading-relaxed">{m.description}</p>
                                <div className="text-[10px] font-bold text-muted">{m.free ? "Free" : `${m.costPerSecond} credits / s`}</div>
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="h-full w-full flex items-center justify-center"><FiLoader className="w-6 h-6 animate-spin text-muted" /></div>}>
      <AdBuilder />
    </Suspense>
  );
}
