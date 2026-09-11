"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useUser, UserButton } from "@clerk/nextjs";
import { IoClose, IoMenu } from "react-icons/io5";
import { FiPlus, FiKey, FiCheck, FiX, FiTrash2, FiFilm, FiUsers, FiVideo, FiDollarSign, FiSettings, FiCalendar } from "react-icons/fi";
import { FaCoins } from "react-icons/fa";
import config from "@/lib/config";
import { useMe } from "@/lib/useMe";
import toast from "react-hot-toast";

const NAV = [
  { name: "Ad Builder", path: "/", icon: FiVideo },
  { name: "AI Actors", path: "/actors", icon: FiUsers },
  { name: "Calendar", path: "/calendar", icon: FiCalendar },
  { name: "Final Videos", path: "/gallery", icon: FiFilm },
  { name: "Pricing", path: "/pricing", icon: FiDollarSign },
  { name: "Settings", path: "/settings/keys", icon: FiSettings },
];

export default function Navbar() {
  const { isLoaded, isSignedIn } = useUser();
  const { me, refresh } = useMe();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [providers, setProviders] = useState([]);
  const [keyProvider, setKeyProvider] = useState("wavespeed");
  const [keyInput, setKeyInput] = useState("");
  const [saving, setSaving] = useState(false);

  const appName = config.appName;
  const hasKeys = me?.hasKeys || {};
  const anyKey = Object.keys(hasKeys).length > 0;

  useEffect(() => {
    if (!isKeyModalOpen || providers.length) return;
    fetch("/api/models")
      .then((r) => r.json())
      .then((d) => setProviders((d.providers || []).filter((p) => p.allowUserKey)))
      .catch(() => {});
  }, [isKeyModalOpen, providers.length]);

  const saveKey = async (e) => {
    e.preventDefault();
    const key = keyInput.trim();
    if (!key) return toast.error("Paste a key first");
    setSaving(true);
    try {
      const res = await fetch("/api/user/apikey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: keyProvider, apiKey: key }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save key");
      await refresh();
      toast.success("Key saved. Generations with this provider are now free of credits.");
      setKeyInput("");
      setIsKeyModalOpen(false);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const removeKey = async (provider) => {
    setSaving(true);
    try {
      const res = await fetch("/api/user/apikey", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      if (!res.ok) throw new Error("Failed to remove key");
      await refresh();
      toast.success("Key removed");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const renderLinks = (mobile) =>
    NAV.map((link) => {
      const active = pathname === link.path || (link.path !== "/" && pathname?.startsWith(link.path.split("/").slice(0, 2).join("/")));
      return (
        <Link
          key={link.path}
          href={link.path}
          onClick={() => setIsOpen(false)}
          className={
            mobile
              ? `flex items-center gap-2 py-2.5 rounded text-sm font-semibold transition-all ${active ? "bg-primary/10 text-primary px-3 border border-primary/20" : "text-primary-text hover:bg-bg-card"}`
              : `flex items-center gap-1.5 text-[13px] font-semibold transition-all relative py-1 ${active ? "text-primary" : "text-secondary-text hover:text-primary-text"}`
          }
        >
          <link.icon className="text-xs" />
          {link.name}
          {active && !mobile && <div className="absolute -bottom-[20px] left-0 right-0 h-0.5 bg-primary rounded-full" />}
        </Link>
      );
    });

  const keyButton = (mobile) => (
    <button
      onClick={() => { setIsOpen(false); setIsKeyModalOpen(true); }}
      className={
        mobile
          ? "flex w-full items-center gap-2 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs font-bold text-amber-600"
          : `flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all cursor-pointer ${anyKey ? "bg-amber-500/10 border-amber-500/30 text-amber-600 hover:bg-amber-500/20" : "bg-bg-page/50 border-divider text-secondary-text hover:text-primary-text hover:border-primary/40"}`
      }
    >
      <FiKey />
      <span>{anyKey ? "Your API keys" : "Use your own key"}</span>
    </button>
  );

  return (
    <header className="sticky top-0 z-50 w-full glass-panel border-b border-divider/50 shadow-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2 transition-transform hover:scale-[1.02] active:scale-95">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white font-extrabold text-lg shadow-md shadow-primary/30">
            {appName.charAt(0)}
          </div>
          <span className="text-lg font-black tracking-tight text-primary-text text-nowrap">{appName}</span>
        </Link>

        <nav className="hidden md:flex items-center gap-6">{renderLinks(false)}</nav>

        <div className="hidden md:flex items-center gap-3">
          {isLoaded && isSignedIn ? (
            <>
              {keyButton(false)}
              <div className="flex items-center h-9 border border-divider rounded bg-bg-page/30 overflow-hidden pr-2">
                <span className="font-bold text-[13px] px-3 flex items-center text-primary-text gap-1.5">
                  <FaCoins className="text-yellow-500 text-xs" />
                  {me?.credits ?? "…"}
                </span>
                <Link href="/pricing" className="flex items-center justify-center w-5 h-5 rounded hover:bg-bg-card text-secondary-text transition-colors" title="Buy credits">
                  <FiPlus size={14} />
                </Link>
              </div>
              <UserButton />
            </>
          ) : isLoaded ? (
            <Link href="/login" className="bg-primary text-white px-5 py-1.5 rounded-full text-sm font-bold hover:bg-primary-hover transition-all shadow-md shadow-primary/20">
              Sign in
            </Link>
          ) : null}
        </div>

        <div className="flex md:hidden items-center gap-2">
          {isSignedIn && (
            <div className="flex items-center h-8 border border-divider rounded bg-bg-page/30 px-2.5 text-xs font-bold text-primary-text gap-1">
              <FaCoins className="text-yellow-500 text-[10px]" />
              {me?.credits ?? "…"}
            </div>
          )}
          {isSignedIn && <UserButton />}
          <button onClick={() => setIsOpen(!isOpen)} className="hover:bg-bg-card p-2 rounded cursor-pointer transition-colors text-primary-text border border-divider/50" aria-label="Toggle menu">
            {isOpen ? <IoClose size={20} /> : <IoMenu size={20} />}
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 z-[200] glass-dropdown border-b border-divider shadow-2xl py-4 px-6 md:hidden animate-fade-in">
          <nav className="flex flex-col gap-3">
            {renderLinks(true)}
            {isSignedIn ? keyButton(true) : (
              <Link href="/login" onClick={() => setIsOpen(false)} className="flex w-full items-center justify-center rounded bg-primary text-white py-3 text-sm font-bold mt-2">
                Sign in
              </Link>
            )}
          </nav>
        </div>
      )}

      {isKeyModalOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-bg-card border border-divider w-full max-w-md rounded-xl p-6 space-y-5 shadow-2xl animate-scale-up text-primary-text">
            <div className="flex items-center justify-between border-b border-divider/60 pb-3">
              <div className="flex items-center gap-2 text-amber-600 font-black text-sm uppercase">
                <FiKey className="text-base" />
                <span>Bring your own API key</span>
              </div>
              <button onClick={() => setIsKeyModalOpen(false)} className="text-secondary-text hover:text-primary-text transition-colors cursor-pointer">
                <FiX size={18} />
              </button>
            </div>

            <p className="text-xs text-secondary-text leading-relaxed">
              Paste a key from a provider you pay directly. Generations with that provider then cost you no Influenci credits. Keys are stored server-side and never shown again.
            </p>

            {providers.length > 0 && (
              <ul className="space-y-2">
                {providers.map((p) => (
                  <li key={p.id} className="flex items-center justify-between text-xs bg-bg-page/60 border border-divider/60 rounded-lg px-3 py-2">
                    <div>
                      <div className="font-bold">{p.label}</div>
                      <a href={p.keyUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline">Get a key →</a>
                    </div>
                    {hasKeys[p.id] ? (
                      <button onClick={() => removeKey(p.id)} disabled={saving} className="flex items-center gap-1 text-red-500 font-bold cursor-pointer">
                        <FiCheck className="text-emerald-500" /> saved <FiTrash2 className="ml-1" />
                      </button>
                    ) : (
                      <span className="text-secondary-text">not set</span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <form onSubmit={saveKey} className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <select value={keyProvider} onChange={(e) => setKeyProvider(e.target.value)} className="col-span-1 bg-bg-page border border-divider rounded-lg px-2 py-2.5 text-xs">
                  {(providers.length ? providers : [{ id: "wavespeed", label: "Wavespeed" }, { id: "muapi", label: "MUAPI" }]).map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
                <input
                  type="password"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder={providers.find((p) => p.id === keyProvider)?.keyHint || "API key"}
                  className="col-span-2 bg-bg-page border border-divider rounded-lg px-3.5 py-2.5 text-xs placeholder-secondary-text/50 focus:outline-none focus:border-amber-400 transition-colors"
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={() => setIsKeyModalOpen(false)} className="px-4 py-2 rounded-lg bg-bg-page border border-divider text-xs font-semibold text-secondary-text cursor-pointer">
                  Close
                </button>
                <button type="submit" disabled={saving || !keyInput.trim()} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-bold transition-all disabled:opacity-50 cursor-pointer">
                  <FiCheck /> <span>{saving ? "Saving…" : "Save key"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  );
}
