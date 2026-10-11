"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { FiLoader, FiZap } from "react-icons/fi";
import { Field, Section, inputCls, btnPrimary, btnGhost, listToText, textToList } from "@/components/ui/form";

export default function ProfileTab({ actor, save, saving, reload }) {
  const b = actor.brandProfile || {};
  const [form, setForm] = useState({
    name: actor.name, timezone: actor.timezone, category: b.category || "", website: b.website || "", oneLiner: b.oneLiner || "", description: b.description || "",
    products: listToText(b.products), campaigns: (b.campaigns || []).map((c) => (typeof c === "string" ? c : `${c.name}${c.description ? ` — ${c.description}` : ""}${c.season ? ` (${c.season})` : ""}`)).join("\n"),
    audience: b.audience || "", voice: b.voice || "", pillars: listToText(b.pillars), doNots: listToText(b.doNots), ctas: listToText(b.ctas),
    coreTags: listToText(b.hashtagSets?.core), seasonalTags: listToText(b.hashtagSets?.seasonal), notes: b.notes || "",
    facebook: b.links?.facebook || "", instagram: b.links?.instagram || "",
    fbFollowers: b.followers?.facebook ?? "", igFollowers: b.followers?.instagram ?? "",
    autoPublish: Boolean(actor.autoPublish), autoPlan: Boolean(actor.cadence?.autoPlan),
  });
  const [generating, setGenerating] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const submit = () => save({
    name: form.name, timezone: form.timezone, autoPublish: form.autoPublish, cadence: { ...(actor.cadence || {}), autoPlan: form.autoPlan },
    brandProfile: {
      category: form.category, website: form.website, oneLiner: form.oneLiner, description: form.description, products: textToList(form.products),
      campaigns: textToList(form.campaigns).map((line) => { const [name, rest] = line.split(" — "); return { name: name.replace(/\s*\(.*\)$/, "").trim(), description: (rest || "").replace(/\s*\(.*\)$/, "").trim(), season: (line.match(/\(([^)]+)\)$/) || [])[1] || "" }; }),
      audience: form.audience, voice: form.voice, pillars: textToList(form.pillars), doNots: textToList(form.doNots), ctas: textToList(form.ctas),
      hashtagSets: { core: textToList(form.coreTags), seasonal: textToList(form.seasonalTags) }, notes: form.notes,
      links: { website: form.website, facebook: form.facebook, instagram: form.instagram },
      followers: { facebook: form.fbFollowers === "" ? null : Number(form.fbFollowers), instagram: form.igFollowers === "" ? null : Number(form.igFollowers) },
    },
  });

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/accounts/${actor.id}/profile`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notes: form.notes }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      toast.success("Profile drafted from the brand's own posts");
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <Section title="Brand" right={<button onClick={generate} disabled={generating} className={btnGhost}>{generating ? <FiLoader className="animate-spin" /> : <FiZap />} Draft with Claude</button>} hint="Claude reads the imported captions and your notes and fills in the brief. Edit anything; your edits win.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Name"><input value={form.name} onChange={set("name")} className={inputCls} /></Field>
          <Field label="Category"><input value={form.category} onChange={set("category")} className={inputCls} /></Field>
          <Field label="Website"><input value={form.website} onChange={set("website")} className={inputCls} /></Field>
          <Field label="Timezone"><input value={form.timezone} onChange={set("timezone")} className={inputCls} /></Field>
          <Field label="Facebook Page"><input value={form.facebook} onChange={set("facebook")} className={inputCls} /></Field>
          <Field label="Instagram"><input value={form.instagram} onChange={set("instagram")} className={inputCls} /></Field>
          <Field label="Facebook followers" hint="Used for engagement rate until the Page is connected"><input type="number" value={form.fbFollowers} onChange={set("fbFollowers")} className={inputCls} /></Field>
          <Field label="Instagram followers"><input type="number" value={form.igFollowers} onChange={set("igFollowers")} className={inputCls} /></Field>
        </div>
        <Field label="One-liner"><input value={form.oneLiner} onChange={set("oneLiner")} className={inputCls} /></Field>
        <Field label="About"><textarea rows={3} value={form.description} onChange={set("description")} className={inputCls} /></Field>
        <Field label="Notes for Claude"><textarea rows={3} value={form.notes} onChange={set("notes")} className={inputCls} placeholder="Anything the writer must know: programs, prizes, rules links, partners, what to avoid…" /></Field>
      </Section>
      <Section title="Voice & content">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Voice"><textarea rows={3} value={form.voice} onChange={set("voice")} className={inputCls} /></Field>
          <Field label="Audience"><textarea rows={3} value={form.audience} onChange={set("audience")} className={inputCls} /></Field>
          <Field label="Products / offers (one per line)"><textarea rows={4} value={form.products} onChange={set("products")} className={inputCls} /></Field>
          <Field label="Campaigns (Name — description (season))"><textarea rows={4} value={form.campaigns} onChange={set("campaigns")} className={inputCls} placeholder="Whitetail Challenge — film your harvest, win cash (Sept–Jan)" /></Field>
          <Field label="Content pillars"><textarea rows={4} value={form.pillars} onChange={set("pillars")} className={inputCls} /></Field>
          <Field label="Calls to action"><textarea rows={4} value={form.ctas} onChange={set("ctas")} className={inputCls} /></Field>
          <Field label="Never"><textarea rows={3} value={form.doNots} onChange={set("doNots")} className={inputCls} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Core hashtags"><textarea rows={3} value={form.coreTags} onChange={set("coreTags")} className={inputCls} /></Field>
            <Field label="Seasonal hashtags"><textarea rows={3} value={form.seasonalTags} onChange={set("seasonalTags")} className={inputCls} /></Field>
          </div>
        </div>
      </Section>
      <Section title="Automation">
        <label className="flex items-center gap-2 text-xs text-foreground"><input type="checkbox" checked={form.autoPublish} onChange={set("autoPublish")} className="accent-primary" /> Auto-approve rendered posts (otherwise they wait as drafts in the calendar)</label>
        <label className="flex items-center gap-2 text-xs text-foreground"><input type="checkbox" checked={form.autoPlan} onChange={set("autoPlan")} className="accent-primary" /> Let the daily planner create posts for this brand (off = posts only come from recommendations you choose)</label>
      </Section>
      <div className="flex justify-end"><button onClick={submit} disabled={saving} className={btnPrimary}>{saving ? "Saving…" : "Save profile"}</button></div>
    </div>
  );
}
