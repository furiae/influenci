"use client";

import { useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import toast from "react-hot-toast";
import { FiLoader, FiImage, FiUpload, FiSend } from "react-icons/fi";
import { Section, inputCls, btnPrimary, btnGhost } from "@/components/ui/form";

/**
 * Free, zero-AI brand cards (winner, contender, throwback, question) in the
 * account's own style. Preview, then create a scheduled post from it.
 */
export default function CardMaker({ actor, onCreated }) {
  const [templates, setTemplates] = useState(null);
  const [template, setTemplate] = useState("winner");
  const [fields, setFields] = useState({});
  const [photoUrl, setPhotoUrl] = useState("");
  const [preview, setPreview] = useState(null);
  const [caption, setCaption] = useState("");
  const [platforms, setPlatforms] = useState(["facebook"]);
  const [busy, setBusy] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => { fetch(`/api/accounts/${actor.id}/cards`).then((r) => (r.ok ? r.json() : null)).then((d) => setTemplates(d?.templates || [])); }, [actor.id]);
  const spec = templates?.find((t) => t.key === template);

  const pickPhoto = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!/image\/(jpeg|png)/.test(f.type)) return toast.error("Use a JPEG or PNG photo");
    setBusy("upload");
    try {
      const blob = await upload(`cards/${actor.id}/${Date.now()}-${f.name}`, f, { access: "public", handleUploadUrl: "/api/upload" });
      setPhotoUrl(blob.url);
      setPreview(null);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  const call = async (create) => {
    setBusy(create ? "create" : "preview");
    try {
      const res = await fetch(`/api/accounts/${actor.id}/cards`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ template, fields, photoUrl: photoUrl || undefined, ...(create ? { create: { caption, platforms } } : {}) }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      setPreview(d.url);
      if (create) {
        toast.success("Post created with the card as its image. Approve it in the calendar.");
        onCreated?.();
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  if (!templates) return null;
  return (
    <Section title="Make a brand card" hint="Winner, contender, throwback and question cards in the brand's style, rendered for free from templates (no AI, no render credits). Add a question or tag in the caption: question posts pull 5–10× the comments.">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1">
            {templates.map((t) => <button key={t.key} type="button" onClick={() => { setTemplate(t.key); setPreview(null); }} className={`px-3 py-1.5 rounded-full text-xs font-bold ${template === t.key ? "bg-primary text-white" : "border border-divider text-muted"}`}>{t.label}</button>)}
          </div>
          {spec && <p className="text-[11px] text-muted">{spec.description}</p>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {spec?.fields.map((f) => (
              <label key={f.key} className={`block space-y-1 ${["headline", "question"].includes(f.key) ? "md:col-span-2" : ""}`}>
                <span className="text-[11px] uppercase font-bold text-muted tracking-wider">{f.label}{f.required ? " *" : ""}</span>
                <input value={fields[f.key] || ""} onChange={(e) => { setFields({ ...fields, [f.key]: e.target.value }); setPreview(null); }} placeholder={f.example} className={inputCls} />
              </label>
            ))}
          </div>
          {spec?.photo && (
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => fileRef.current?.click()} disabled={Boolean(busy)} className={btnGhost}>{busy === "upload" ? <FiLoader className="animate-spin" /> : <FiUpload />} {photoUrl ? "Change photo" : "Hunter photo (JPEG/PNG) *"}</button>
              {photoUrl && <img src={photoUrl} alt="" className="w-10 h-10 rounded object-cover border border-divider" />}
              <input ref={fileRef} type="file" accept="image/jpeg,image/png" className="hidden" onChange={pickPhoto} />
            </div>
          )}
          <button type="button" onClick={() => call(false)} disabled={Boolean(busy)} className={btnPrimary}>{busy === "preview" ? <FiLoader className="animate-spin" /> : <FiImage />} Preview card</button>
          {preview && (
            <div className="space-y-2 pt-2 border-t border-divider">
              <textarea rows={4} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Caption. End with a question or tag the hunter, e.g. “Congrats Jon! Who's chasing that title next? 👇”" className={inputCls} />
              <div className="flex flex-wrap items-center gap-2">
                {["facebook", "instagram"].map((p) => <label key={p} className="flex items-center gap-1 text-xs"><input type="checkbox" checked={platforms.includes(p)} onChange={() => setPlatforms((x) => (x.includes(p) ? x.filter((y) => y !== p) : [...x, p]))} className="accent-primary" /> {p}</label>)}
                <button type="button" onClick={() => call(true)} disabled={Boolean(busy) || !caption || !platforms.length} className={btnPrimary}>{busy === "create" ? <FiLoader className="animate-spin" /> : <FiSend />} Create post</button>
              </div>
            </div>
          )}
        </div>
        <div className="rounded-lg border border-divider bg-bg-page aspect-[4/5] overflow-hidden flex items-center justify-center">
          {preview ? <img src={preview} alt="Card preview" className="w-full h-full object-contain" /> : <span className="text-xs text-muted p-4 text-center">Fill in the fields and press Preview card.</span>}
        </div>
      </div>
    </Section>
  );
}
