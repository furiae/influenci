"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import toast, { Toaster } from "react-hot-toast";
import { FiKey, FiCheck, FiTrash2 } from "react-icons/fi";
import { useMe } from "@/lib/useMe";

export default function KeySettings() {
  const { me, refresh } = useMe();
  const [providers, setProviders] = useState([]);
  const [inputs, setInputs] = useState({});
  const [busy, setBusy] = useState(null);
  const hasKeys = me?.hasKeys || {};

  useEffect(() => {
    fetch("/api/models")
      .then((r) => r.json())
      .then((d) => setProviders((d.providers || []).filter((p) => p.allowUserKey)))
      .catch(() => {});
  }, []);

  const save = async (provider) => {
    const key = (inputs[provider] || "").trim();
    if (!key) return toast.error("Paste a key first");
    setBusy(provider);
    try {
      const res = await fetch("/api/user/apikey", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, apiKey: key }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setInputs((s) => ({ ...s, [provider]: "" }));
      await refresh();
      toast.success("Key saved");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (provider) => {
    setBusy(provider);
    try {
      const res = await fetch("/api/user/apikey", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider }) });
      if (!res.ok) throw new Error("Failed to remove");
      await refresh();
      toast.success("Key removed");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-12">
      <Toaster position="top-right" />
      <header className="max-w-3xl mx-auto mb-8 space-y-2">
        <div className="flex items-center gap-3 text-xs font-bold text-muted">
          <span className="text-foreground">Provider keys</span>
          {me?.role === "owner" && (<><span>·</span><Link href="/settings/platforms" className="hover:text-foreground">Platform apps</Link></>)}
        </div>
        <h1 className="text-2xl font-black text-foreground">Your provider keys</h1>
        <p className="text-muted text-xs leading-relaxed max-w-2xl">
          Bring your own key for a video provider and generations with it cost you no credits. Keys are encrypted at rest and never displayed again.
        </p>
      </header>
      <div className="max-w-3xl mx-auto space-y-4">
        {providers.map((p) => (
          <section key={p.id} className="rounded-xl border border-divider bg-bg-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-black text-foreground flex items-center gap-2"><FiKey className="text-amber-500" /> {p.label}</h2>
                <p className="text-[11px] text-muted">{p.description}</p>
              </div>
              {hasKeys[p.id] ? (
                <button onClick={() => remove(p.id)} disabled={busy === p.id} className="flex items-center gap-1 text-xs font-bold text-rose-500"><FiCheck className="text-emerald-500" /> saved <FiTrash2 /></button>
              ) : (
                <span className="text-xs text-muted">not set</span>
              )}
            </div>
            <div className="flex gap-2">
              <input type="password" value={inputs[p.id] || ""} onChange={(e) => setInputs((s) => ({ ...s, [p.id]: e.target.value }))} placeholder={p.keyHint || "API key"} className="flex-1 bg-bg-page border border-divider rounded-lg px-3 py-2 text-sm" />
              <button onClick={() => save(p.id)} disabled={busy === p.id} className="px-4 py-2 rounded-lg bg-amber-500 text-neutral-950 text-xs font-bold disabled:opacity-50">Save</button>
              <a href={p.keyUrl} target="_blank" rel="noopener noreferrer" className="px-3 py-2 rounded-lg border border-divider text-xs font-bold text-muted">Get key</a>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
