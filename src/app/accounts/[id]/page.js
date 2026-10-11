"use client";

import { useEffect, useState, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import toast, { Toaster } from "react-hot-toast";
import { FiLoader, FiArrowLeft, FiBriefcase, FiGrid, FiImage, FiBarChart2, FiLayers, FiZap, FiTrendingUp, FiLink, FiUser, FiRefreshCw, FiCalendar } from "react-icons/fi";
import CompetitorsTab from "@/components/actor/CompetitorsTab";
import OverviewTab from "@/components/accounts/OverviewTab";
import PostsTab from "@/components/accounts/PostsTab";
import InsightsTab from "@/components/accounts/InsightsTab";
import DesignTab from "@/components/accounts/DesignTab";
import RecommendTab from "@/components/accounts/RecommendTab";
import ChannelsTab from "@/components/accounts/ChannelsTab";
import ProfileTab from "@/components/accounts/ProfileTab";
import { fmt, PLATFORM_DOT } from "@/components/ui/form";

const TABS = [
  { id: "overview", label: "Overview", icon: FiGrid },
  { id: "posts", label: "Posts", icon: FiImage },
  { id: "insights", label: "Insights", icon: FiBarChart2 },
  { id: "design", label: "Design system", icon: FiLayers },
  { id: "recommend", label: "Recommend", icon: FiZap },
  { id: "competitors", label: "Competitors", icon: FiTrendingUp },
  { id: "channels", label: "Channels", icon: FiLink },
  { id: "profile", label: "Profile", icon: FiUser },
];

function AccountDetail() {
  const { id } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") || "overview";
  const [actor, setActor] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () =>
    fetch(`/api/accounts/${id}`)
      .then(async (r) => { if (!r.ok) throw new Error("Not found"); return r.json(); })
      .then(setActor)
      .catch(() => { toast.error("Brand not found"); router.push("/accounts"); });
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const c = searchParams.get("connected");
    const e = searchParams.get("error");
    if (c) toast.success(`${c} connected. Start the import from the Channels tab.`);
    if (e) toast.error(e);
  }, [searchParams]);
  useEffect(() => {
    if (actor?.importStatus !== "importing") return;
    const t = setInterval(load, 12000);
    return () => clearInterval(t);
  }, [actor?.importStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (patch) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/accounts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
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
      <div className="max-w-6xl mx-auto space-y-6">
        <Link href="/accounts" className="text-xs font-bold text-muted flex items-center gap-1 hover:text-foreground"><FiArrowLeft /> All brands</Link>
        <header className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-glass-hover overflow-hidden border border-divider flex items-center justify-center">{actor.imageUrl ? <img src={actor.imageUrl} alt="" className="w-full h-full object-cover" /> : <FiBriefcase className="text-muted text-xl" />}</div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-black text-foreground flex items-center gap-3">{actor.name}
              {actor.importStatus === "importing" && <span className="text-[10px] font-black uppercase px-2 py-1 rounded bg-amber-500/10 text-amber-600 flex items-center gap-1"><FiRefreshCw className="animate-spin" /> importing</span>}
              {actor.importStatus === "failed" && <span className="text-[10px] font-black uppercase px-2 py-1 rounded bg-rose-500/10 text-rose-600" title={actor.importError || ""}>import failed</span>}
            </h1>
            <p className="text-xs text-muted flex items-center gap-3 flex-wrap">
              <span className="font-bold text-primary">{actor.brandProfile?.category || "Brand"}</span>
              {actor.channels.map((c) => <span key={c.id} className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: PLATFORM_DOT[c.platform] }} />@{c.handle} · {fmt(c.followers)}</span>)}
              <span>{actor._count.channelPosts} posts · avg score {actor.stats.avgScore != null ? actor.stats.avgScore.toFixed(1) : "–"}</span>
            </p>
          </div>
          <Link href={`/calendar`} className="hidden md:flex items-center gap-2 px-4 py-2 rounded-lg border border-divider text-xs font-bold text-muted hover:text-foreground"><FiCalendar /> Calendar</Link>
          <Link href={`/accounts/${id}/report`} className="hidden md:flex items-center gap-2 px-4 py-2 rounded-lg border border-divider text-xs font-bold text-muted hover:text-foreground">Report</Link>
        </header>
        <nav className="flex gap-1 border-b border-divider overflow-x-auto">
          {TABS.map((t) => (
            <Link key={t.id} href={`/accounts/${id}?tab=${t.id}`} className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 -mb-px whitespace-nowrap ${tab === t.id ? "border-primary text-primary" : "border-transparent text-muted hover:text-foreground"}`}>
              <t.icon /> {t.label}
            </Link>
          ))}
        </nav>
        {tab === "overview" && <OverviewTab actor={actor} reload={load} />}
        {tab === "posts" && <PostsTab actor={actor} />}
        {tab === "insights" && <InsightsTab actor={actor} />}
        {tab === "design" && <DesignTab actor={actor} reload={load} />}
        {tab === "recommend" && <RecommendTab actor={actor} reload={load} />}
        {tab === "competitors" && <CompetitorsTab actor={actor} brand />}
        {tab === "channels" && <ChannelsTab actor={actor} reload={load} />}
        {tab === "profile" && <ProfileTab key={actor.updatedAt} actor={actor} save={save} saving={saving} reload={load} />}
      </div>
    </div>
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={<div className="h-full flex items-center justify-center"><FiLoader className="animate-spin text-primary text-2xl" /></div>}>
      <AccountDetail />
    </Suspense>
  );
}
