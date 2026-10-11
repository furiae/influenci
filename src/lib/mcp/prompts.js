import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { mcpUser, brandFor } from "./context";
import { computeStats, statsToPrompt } from "@/lib/insights/stats";
import { topBenchmarks, benchmarksToPrompt } from "@/lib/benchmarks";
import { upcomingSeasons, seasonsToPrompt } from "@/lib/insights/seasonality";
import { predictionBaselines } from "@/lib/insights/recommend";
import { bibleToSystemPrompt } from "@/lib/personas/bible";
import { computeCalibration } from "@/lib/insights/summary";

const msg = (t) => ({ messages: [{ role: "user", content: { type: "text", text: t } }] });

/**
 * Prompts reproduce the server-side prompt logic so work done in Claude.ai on
 * the subscription matches the quality of the API path.
 */
export function registerPrompts(server) {
  server.registerPrompt("import-screenshots", { title: "Import posts from screenshots", description: "Paste screenshots of posts; transcribe them and record them with record_posts.", argsSchema: z.object({ brandId: z.string(), platform: z.string().optional() }) }, async ({ brandId, platform }, extra) => {
    const actor = await brandFor(await mcpUser(extra), brandId);
    return msg(`The user will paste screenshots of ${actor.name}'s ${platform || "facebook"} posts. For EVERY post visible (a screenshot may hold several):
- read likes/reactions, comments, shares, views exactly as shown
- copy the caption verbatim (emojis and hashtags included); if truncated with "See more", copy what is visible
- postedAt: ISO date-time. Today is ${new Date().toISOString().slice(0, 10)}. "September 27 at 9:00 AM" → this year unless that is in the future; "5 days ago" → subtract from today at 12:00; date-only → 12:00.
- mediaType: image | carousel | video | reel | graphic (designed text/branded card) | text | link
- format: a short label such as "winner card", "contender card", "throwback card", "question reel", "testimonial", "program announcement", "sponsor promo"
- overlayText, mediaDescription (one sentence), brandReplied (true if the page replies in the thread)
Then call record_posts with brandId "${actor.id}" and platform "${platform || "facebook"}" in batches of up to 50. Report what was recorded and the scores returned. Ask for more screenshots.`);
  });

  server.registerPrompt("weekly-review", { title: "Weekly performance review", description: "Analyse the brand's numbers and store the narrative with save_insights_summary.", argsSchema: z.object({ brandId: z.string() }) }, async ({ brandId }, extra) => {
    const actor = await brandFor(await mcpUser(extra), brandId);
    const stats = await computeStats(actor.id);
    return msg(`${bibleToSystemPrompt(actor)}

You are now acting as the brand's analyst. Ground every statement in the numbers below; cite posts by their [id]. Be direct and specific.

${statsToPrompt(stats)}

Write the performance summary as JSON matching: { headline, working[2-6], notWorking[≤5], actions[3-6 of {action, why, expectedImpact}], audienceNotes, bestTimes }. Then call save_insights_summary with brandId "${actor.id}" and that narrative. Finally give the user a 6-line plain-English version.`);
  });

  server.registerPrompt("analyze-posts", { title: "Analyse unanalysed posts", description: "Look at each unanalysed post (thumbnail + caption + metrics) and store the analysis.", argsSchema: z.object({ brandId: z.string(), limit: z.string().optional() }) }, async ({ brandId, limit }, extra) => {
    const actor = await brandFor(await mcpUser(extra), brandId);
    const n = Math.min(20, Number(limit) || 8);
    const posts = await prisma.channelPost.findMany({ where: { actorId: actor.id, analyzedAt: null }, orderBy: [{ score: "desc" }], take: n, select: { id: true, caption: true, thumbnailUrl: true, likes: true, comments: true, shares: true, score: true, mediaType: true, raw: true } });
    return msg(`Analyse these ${posts.length} posts by ${actor.name}. For each, view the thumbnail URL if present, then call save_post_analysis(postId, analysis) with: format, subject, activity (whitetail|turkey|bass|waterfowl|elk|ice fishing|gear|giveaway|community|other), hook, captionStyle, ctaType (none|enter|shop|comment|share|tag|link|follow), hasTextOverlay, overlayText, palette (≤5 hex), composition, imageryType (photo|graphic|screenshot|ugc|video|mixed), tone, whyItWorks (judge against the metrics), improvements (≤3), topics (≤5).

${posts.map((p, i) => `${i + 1}. [${p.id}] ${p.mediaType} score ${p.score ?? "n/a"} · ${p.likes} likes / ${p.comments} comments / ${p.shares} shares${p.thumbnailUrl ? `\n   image: ${p.thumbnailUrl}` : ""}${p.raw?.mediaDescription ? `\n   media: ${p.raw.mediaDescription}` : ""}\n   caption: ${(p.caption || "").replace(/\s+/g, " ").slice(0, 400)}`).join("\n")}`);
  });

  server.registerPrompt("extract-design-system", { title: "Extract design system", description: "Derive the brand's visual + caption design system from its best posts and store it.", argsSchema: z.object({ brandId: z.string() }) }, async ({ brandId }, extra) => {
    const actor = await brandFor(await mcpUser(extra), brandId);
    const top = await prisma.channelPost.findMany({ where: { actorId: actor.id, score: { not: null } }, orderBy: [{ score: "desc" }], take: 20, select: { id: true, caption: true, thumbnailUrl: true, score: true, mediaType: true, format: true, raw: true } });
    return msg(`You are a brand designer and copy chief reverse-engineering ${actor.name}'s design system and voice from its best posts. Prefer concrete values (hex colours, placements, word counts). View each thumbnail URL that exists.

${top.map((p, i) => `${i + 1}. [${p.id}] ${p.format || p.mediaType} score ${p.score}${p.thumbnailUrl ? ` · ${p.thumbnailUrl}` : ""}\n   ${(p.caption || "").replace(/\s+/g, " ").slice(0, 300)}`).join("\n")}

Then call save_design_system with brandId "${actor.id}" and the design system: { palette[{hex, role}], typography{overlayStyle, caseStyle}, logoPlacement, imagery{subjects[], styles[], framing[]}, layoutPatterns[], overlayRules, captionStyle{length, openers[], structure, emoji, hashtagSets{core[], seasonal[]}, ctaPatterns[]}, postingRhythm, doNots[], examples[{channelPostId, why}], summary }.`);
  });

  server.registerPrompt("recommend-posts", { title: "Recommend posts", description: "Propose new posts with predicted score/reach, grounded in our stats, competitors and seasonality; store them with add_recommendations.", argsSchema: z.object({ brandId: z.string(), count: z.string().optional(), focus: z.string().optional() }) }, async ({ brandId, count, focus }, extra) => {
    const actor = await brandFor(await mcpUser(extra), brandId);
    const stats = await computeStats(actor.id);
    const benchmarks = await topBenchmarks(actor.id, { limit: 12, days: 120 });
    const seasons = upcomingSeasons({ days: 30, extra: actor.brandProfile?.seasonality || [] });
    const b = predictionBaselines(stats);
    const cal = await computeCalibration(actor.id);
    const n = Math.min(15, Number(count) || 10);
    const pct = (x) => (x == null ? "n/a" : `${(x * 100).toFixed(2)}%`);
    const num = (x) => (x == null ? "n/a" : Math.round(x).toLocaleString());
    return msg(`${bibleToSystemPrompt(actor)}

You are now the brand's content strategist. Propose ${n} new posts${focus ? ` with this focus: ${focus}` : ""}. Cite evidence: our posts by [id], competitor posts by number. Predictions will be checked against reality later, so be calibrated.

${statsToPrompt(stats)}

${benchmarksToPrompt(benchmarks.map((x, i) => ({ ...x, caption: `[B${i + 1} ${x.id}] ${x.caption || ""}` })))}

${seasonsToPrompt(seasons)}

PREDICTION ANCHORS: overall median reach ${num(b.overall.medianReach)}, P90 ${num(b.overall.p90Reach)}, median ER ${pct(b.overall.medianER)}, P90 ER ${pct(b.overall.p90ER)}. Score 10 = top decile of our own posts, 5 = median, 1 = bottom decile.${cal ? ` Past accuracy over ${cal.n} published recommendations: MAE ${cal.mae}, bias ${cal.bias} (positive = over-predicted); correct for it.` : ""}

Rules: mix formats and pillars; ≥3 ride a seasonal moment; ≥2 are variations of our proven top posts; ≥2 borrow a competitor format we have not tried; every card-style post carries a question or tags the hunter; giveaway posts include "No purchase necessary" and the rules link; bestTime from BEST SLOTS.

Call add_recommendations with brandId "${actor.id}" and the list: each { title, concept, hook, format, platforms, caption, hashtags, visualBrief{subject, composition, overlayText, palette, notes}, bestTime{weekday, hourLocal}, predictedScore, predictedReachLow, predictedReachHigh, predictedEngagementRate, confidence, rationale, basedOnOwnPosts[ids], basedOnBenchmarks[ids], seasonalHook }. Then summarise the top 3 for the user.`);
  });

  server.registerPrompt("write-winner-post", { title: "Write a winner / contender post", description: "Draft a caption in the brand voice for a hunter's result and create the card post.", argsSchema: z.object({ brandId: z.string(), hunter: z.string(), state: z.string(), place: z.string().optional(), prize: z.string().optional(), photoUrl: z.string().optional() }) }, async ({ brandId, hunter, state, place, prize, photoUrl }, extra) => {
    const actor = await brandFor(await mcpUser(extra), brandId);
    const kind = place ? "winner" : "contender";
    return msg(`${bibleToSystemPrompt(actor)}

Write a ${kind} post for ${hunter} (${state}${place ? `, ${place} place` : ""}${prize ? `, ${prize}` : ""}). Match the account's best-performing ${kind} captions: Title Case Every Word, congratulate by name, one line of pride, then a CTA to enter, and END WITH A QUESTION that invites comments (the data shows question posts get 5-10× the comments). Keep it under 60 words.

Then call create_post with brandId "${actor.id}", platforms ["facebook","instagram"], format "image", the caption, and visualBrief { subject: "${hunter} with the buck", template: "${kind}", fields: { name: "${hunter}", state: "${state}"${place ? `, place: "${place}"` : ""}${prize ? `, prize: "${prize}"` : ""}, year: "${new Date().getFullYear()}" }${photoUrl ? `, photoUrl: "${photoUrl}"` : ""} }. Report the calendar link.`);
  });
}

export function registerResources(server) {
  server.registerResource("brand-stats", "influenci://brands/{brandId}/stats", { title: "Brand stats", description: "Performance stats prompt block for a brand", mimeType: "text/plain" }, async (uri, _vars, extra) => {
    const brandId = String(uri.href).split("/brands/")[1]?.split("/")[0];
    const actor = await brandFor(await mcpUser(extra), brandId);
    return { contents: [{ uri: uri.href, text: statsToPrompt(await computeStats(actor.id)) }] };
  });
}
