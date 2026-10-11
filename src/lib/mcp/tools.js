import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { mcpUser, brandFor, json, text, fail } from "./context";
import { computeStats, statsToPrompt } from "@/lib/insights/stats";
import { recordPosts } from "@/lib/insights/screenshots";
import { rescoreActor } from "@/lib/insights/sync";
import { saveDesignSystem } from "@/lib/insights/design-system";
import { predictionBaselines, clampPrediction } from "@/lib/insights/recommend";
import { createPostFromRecommendation, schedulePreviewPost, discardPreviewPost } from "@/lib/insights/post-from-rec";
import { upcomingSeasons } from "@/lib/insights/seasonality";
import { topBenchmarks, benchmarksToPrompt } from "@/lib/benchmarks";
import { bibleToSystemPrompt } from "@/lib/personas/bible";
import { PostAnalysisSchema, InsightsSummarySchema, DesignSystemSchema, RecommendationsSchema } from "@/lib/content/schemas";
import { logEvent } from "@/lib/scheduler/status";
import { settleRecommendations, computeCalibration } from "@/lib/insights/summary";
import { enforceLimits } from "@/lib/content/limits";
import { slotsForDay } from "@/lib/scheduler/cadence";
import { todayIn } from "@/lib/time";
import { mergeBrandProfile } from "@/lib/personas/brand";
import { renderCardToBlob, TEMPLATES } from "@/lib/render/cards";

const PlatformEnum = z.enum(["facebook", "facebook_group", "instagram", "tiktok", "x", "youtube"]);

const PostInput = z.object({
  platform: PlatformEnum.optional(),
  author: z.enum(["brand", "member"]).optional().describe("member = a post by a member of the brand's own Facebook group (stored as a community benchmark, not as the brand's post)"),
  postedAt: z.string().describe("ISO 8601 date-time"),
  caption: z.string(),
  likes: z.number().int().min(0),
  comments: z.number().int().min(0),
  shares: z.number().int().min(0),
  views: z.number().int().min(0).optional(),
  mediaType: z.enum(["image", "carousel", "video", "reel", "graphic", "text", "link"]).optional(),
  format: z.string().optional().describe("Short format label, e.g. 'winner card', 'question reel'"),
  overlayText: z.string().optional(),
  mediaDescription: z.string().optional(),
  brandReplied: z.boolean().optional(),
  externalId: z.string().optional().describe("Platform post id when known; otherwise omitted and derived"),
});

const compact = (p) => ({ id: p.id, platform: p.platform, mediaType: p.mediaType, format: p.format, postedAt: p.postedAt, score: p.score, provisional: p.scoreBreakdown?.provisional || false, engagementRate: p.engagementRate, reach: p.reach, likes: p.likes, comments: p.comments, shares: p.shares, saves: p.saves, views: p.views, caption: (p.caption || "").slice(0, 400), thumbnailUrl: p.thumbnailUrl, url: p.url, source: p.source, analyzed: Boolean(p.analyzedAt) });

export function registerTools(server) {
  /* ---------- read ---------- */
  server.registerTool("list_brands", { title: "List brands", description: "Brand accounts this user manages in Influenci, with follower counts and post totals.", inputSchema: z.object({}) }, async (_args, extra) => {
    try {
      const user = await mcpUser(extra);
      const brands = await prisma.actor.findMany({ where: { userId: user.id, kind: "brand" }, include: { channels: { select: { platform: true, handle: true, followers: true, status: true } }, _count: { select: { channelPosts: true, recommendations: true } } } });
      return json(brands.map((b) => ({ id: b.id, name: b.name, category: b.brandProfile?.category, followers: { ...(b.brandProfile?.followers || {}), ...Object.fromEntries(b.channels.filter((c) => c.followers).map((c) => [c.platform, c.followers])) }, channels: b.channels, posts: b._count.channelPosts, recommendations: b._count.recommendations, designSystemVersion: b.designSystemVersion, importStatus: b.importStatus })));
    } catch (err) { return fail(err); }
  });

  server.registerTool("get_brand", { title: "Get brand", description: "Brand profile, voice, campaigns, design system and the system prompt Influenci uses for this brand.", inputSchema: z.object({ brandId: z.string() }) }, async ({ brandId }, extra) => {
    try {
      const actor = await brandFor(await mcpUser(extra), brandId);
      return json({ id: actor.id, name: actor.name, timezone: actor.timezone, brandProfile: actor.brandProfile, designSystem: actor.designSystem, designSystemVersion: actor.designSystemVersion, insightsSummary: actor.insightsSummary, systemPrompt: bibleToSystemPrompt(actor) });
    } catch (err) { return fail(err); }
  });

  server.registerTool("update_brand", { title: "Update brand profile", description: "Merge fields into the brand profile (followers, bio, links, community such as a Facebook group, campaigns, voice, notes). Only the fields you pass change.", inputSchema: z.object({ brandId: z.string(), profile: z.record(z.string(), z.any()).describe("Partial brandProfile, e.g. { followers: { facebook: 22000 }, community: { facebookGroup: { name, members, private } } }") }) }, async ({ brandId, profile }, extra) => {
    try {
      const actor = await brandFor(await mcpUser(extra), brandId);
      const merged = mergeBrandProfile(actor.brandProfile, profile);
      await prisma.actor.update({ where: { id: actor.id }, data: { brandProfile: merged, bible: { ...(actor.bible || {}), category: merged.category } } });
      return json({ brandProfile: merged });
    } catch (err) { return fail(err); }
  });

  server.registerTool("list_posts", { title: "List posts", description: "Our own posts with metrics and 1-10 scores. Sort by score, date, er or reach.", inputSchema: z.object({ brandId: z.string(), platform: PlatformEnum.optional(), format: z.string().optional(), minScore: z.number().int().min(1).max(10).optional(), sort: z.enum(["score", "date", "er", "reach"]).default("score"), limit: z.number().int().min(1).max(200).default(50) }) }, async ({ brandId, platform, format, minScore, sort, limit }, extra) => {
    try {
      const actor = await brandFor(await mcpUser(extra), brandId);
      const where = { actorId: actor.id, ...(platform ? { platform } : {}), ...(format ? { OR: [{ format }, { mediaType: format }] } : {}), ...(minScore ? { score: { gte: minScore } } : {}) };
      const orderBy = sort === "date" ? [{ postedAt: "desc" }] : sort === "er" ? [{ engagementRate: { sort: "desc", nulls: "last" } }] : sort === "reach" ? [{ reach: { sort: "desc", nulls: "last" } }] : [{ score: { sort: "desc", nulls: "last" } }, { postedAt: "desc" }];
      const posts = await prisma.channelPost.findMany({ where, orderBy, take: limit });
      return json(posts.map(compact));
    } catch (err) { return fail(err); }
  });

  server.registerTool("get_post", { title: "Get post", description: "One post with full caption, metrics, score breakdown, analysis and metric history.", inputSchema: z.object({ postId: z.string() }) }, async ({ postId }, extra) => {
    try {
      const user = await mcpUser(extra);
      const p = await prisma.channelPost.findFirst({ where: { id: postId, actor: { userId: user.id } }, include: { metrics: { orderBy: { capturedAt: "asc" }, take: 60 } } });
      if (!p) return fail("Post not found");
      return json({ ...compact(p), caption: p.caption, scoreBreakdown: p.scoreBreakdown, analysis: p.analysis, hashtags: p.hashtags, raw: p.raw, metrics: p.metrics });
    } catch (err) { return fail(err); }
  });

  server.registerTool("get_stats", { title: "Get stats", description: "Deterministic performance stats (by platform/format/weekday/hour, top & bottom posts, hashtags, topics, baselines) plus the same text block Influenci feeds its own prompts. Use before summarising or recommending.", inputSchema: z.object({ brandId: z.string(), days: z.number().int().min(30).max(730).default(365) }) }, async ({ brandId, days }, extra) => {
    try {
      const actor = await brandFor(await mcpUser(extra), brandId);
      const stats = await computeStats(actor.id, { days });
      const { heatmap, ...rest } = stats;
      return json({ promptBlock: statsToPrompt(stats), baselines: predictionBaselines(stats), bestSlots: stats.bestSlots, stats: rest, heatmapCells: heatmap.length });
    } catch (err) { return fail(err); }
  });

  server.registerTool("list_benchmarks", { title: "List competitor benchmarks", description: "Top competitor posts (hunting/fishing niche) with engagement and any analysis, plus the prompt block Influenci uses.", inputSchema: z.object({ brandId: z.string(), limit: z.number().int().min(1).max(40).default(15) }) }, async ({ brandId, limit }, extra) => {
    try {
      const actor = await brandFor(await mcpUser(extra), brandId);
      const posts = await topBenchmarks(actor.id, { limit, days: 180 });
      return json({ promptBlock: benchmarksToPrompt(posts), posts: posts.map((b) => ({ id: b.id, competitor: b.competitor.handle, platform: b.platform, caption: (b.caption || "").slice(0, 300), likes: b.likes, comments: b.comments, shares: b.shares, views: b.views, score: b.score, url: b.url, analysis: b.analysis })) });
    } catch (err) { return fail(err); }
  });

  server.registerTool("get_seasonality", { title: "Get seasonality", description: "Outdoor-industry moments (rut, turkey, openers, holidays) plus the brand's own campaign dates for the next N days.", inputSchema: z.object({ brandId: z.string().optional(), days: z.number().int().min(7).max(120).default(30) }) }, async ({ brandId, days }, extra) => {
    try {
      const user = await mcpUser(extra);
      const actor = brandId ? await brandFor(user, brandId) : null;
      return json(upcomingSeasons({ days, extra: actor?.brandProfile?.seasonality || [] }));
    } catch (err) { return fail(err); }
  });

  server.registerTool("list_recommendations", { title: "List recommendations", description: "Recommended posts already in the library and past prediction accuracy.", inputSchema: z.object({ brandId: z.string(), status: z.enum(["suggested", "saved", "dismissed", "used"]).optional() }) }, async ({ brandId, status }, extra) => {
    try {
      const actor = await brandFor(await mcpUser(extra), brandId);
      const items = await prisma.recommendation.findMany({ where: { actorId: actor.id, ...(status ? { status } : { status: { not: "dismissed" } }) }, orderBy: { createdAt: "desc" }, take: 100 });
      return json({ calibration: await computeCalibration(actor.id), items: items.map((r) => ({ id: r.id, status: r.status, title: r.title, format: r.format, platforms: r.platforms, predictedScore: r.predictedScore, actualScore: r.actualScore, postId: r.postId, createdAt: r.createdAt })) });
    } catch (err) { return fail(err); }
  });

  server.registerTool("list_scheduled", { title: "List scheduled posts", description: "Posts in the calendar for a brand (planned, rendering, draft, approved, published).", inputSchema: z.object({ brandId: z.string(), limit: z.number().int().min(1).max(100).default(30) }) }, async ({ brandId, limit }, extra) => {
    try {
      const actor = await brandFor(await mcpUser(extra), brandId);
      const posts = await prisma.post.findMany({ where: { actorId: actor.id }, orderBy: { createdAt: "desc" }, take: limit, include: { targets: { select: { platform: true, status: true, scheduledAt: true, url: true, caption: true } } } });
      return json(posts.map((p) => ({ id: p.id, status: p.status, planDate: p.planDate, mediaType: p.mediaType, hook: p.hook, idea: p.idea, keyframeUrl: p.keyframeUrl, videoUrl: p.videoUrl, targets: p.targets })));
    } catch (err) { return fail(err); }
  });

  server.registerTool("list_actors", { title: "List AI actors", description: "AI persona actors (not brands) with their bible and channels, for create_actor_post.", inputSchema: z.object({}) }, async (_args, extra) => {
    try {
      const user = await mcpUser(extra);
      const actors = await prisma.actor.findMany({ where: { userId: user.id, kind: { not: "brand" } }, include: { channels: { select: { platform: true, handle: true, status: true } } } });
      return json(actors.map((a) => ({ id: a.id, name: a.name, kind: a.kind, category: a.bible?.category, tagline: a.bible?.tagline, identityStatus: a.identityStatus, channels: a.channels, systemPrompt: bibleToSystemPrompt(a) })));
    } catch (err) { return fail(err); }
  });

  /* ---------- write ---------- */
  server.registerTool("record_posts", { title: "Record posts", description: "Store posts you transcribed from screenshots (or pasted). Influenci dedupes, scores them 1-10 and appends a metric snapshot. Send likes/comments/shares exactly as shown.", inputSchema: z.object({ brandId: z.string(), platform: PlatformEnum.default("facebook"), posts: z.array(PostInput).min(1).max(200) }) }, async ({ brandId, platform, posts }, extra) => {
    try {
      const actor = await brandFor(await mcpUser(extra), brandId);
      const r = await recordPosts(actor.id, posts, { source: "screenshot", defaultPlatform: platform });
      await logEvent({ actorId: actor.id, kind: "import", step: "mcp_record_posts", message: `${r.ids.length} posts` });
      const rows = await prisma.channelPost.findMany({ where: { id: { in: r.ids } }, select: { id: true, postedAt: true, score: true, engagementRate: true, caption: true } });
      return json({ recorded: r.ids.length, posts: rows.map((p) => ({ id: p.id, postedAt: p.postedAt, score: p.score, engagementRate: p.engagementRate, caption: (p.caption || "").slice(0, 80) })) });
    } catch (err) { return fail(err); }
  });

  server.registerTool("record_benchmark_posts", { title: "Record competitor posts", description: "Store competitor posts transcribed from screenshots as benchmarks.", inputSchema: z.object({ competitorId: z.string(), posts: z.array(PostInput.pick({ postedAt: true, caption: true, likes: true, comments: true, shares: true, views: true, mediaType: true, externalId: true })).min(1).max(100) }) }, async ({ competitorId, posts }, extra) => {
    try {
      const user = await mcpUser(extra);
      const c = await prisma.competitor.findFirst({ where: { id: competitorId, actor: { userId: user.id } } });
      if (!c) return fail("Competitor not found");
      const { scorePost } = await import("@/lib/benchmarks");
      let n = 0;
      for (const p of posts) {
        const externalId = p.externalId || `ss_${Buffer.from(`${p.postedAt}|${(p.caption || "").slice(0, 40)}`).toString("base64url").slice(0, 24)}`;
        const data = { caption: p.caption, mediaType: p.mediaType || "image", postedAt: new Date(p.postedAt), likes: p.likes, comments: p.comments, shares: p.shares, views: p.views || 0 };
        await prisma.benchmarkPost.upsert({ where: { competitorId_externalId: { competitorId: c.id, externalId } }, create: { competitorId: c.id, platform: c.platform, externalId, ...data, score: scorePost(data, c.followers || 0) }, update: { ...data, score: scorePost(data, c.followers || 0), fetchedAt: new Date() } });
        n += 1;
      }
      await prisma.competitor.update({ where: { id: c.id }, data: { lastFetchedAt: new Date(), lastError: null } });
      return json({ recorded: n });
    } catch (err) { return fail(err); }
  });

  server.registerTool("save_post_analysis", { title: "Save post analysis", description: "Store your analysis of one of our posts (format, hook, why it worked…). Shape matches Influenci's own analysis.", inputSchema: z.object({ postId: z.string(), analysis: PostAnalysisSchema }) }, async ({ postId, analysis }, extra) => {
    try {
      const user = await mcpUser(extra);
      const p = await prisma.channelPost.findFirst({ where: { id: postId, actor: { userId: user.id } } });
      if (!p) return fail("Post not found");
      await prisma.channelPost.update({ where: { id: p.id }, data: { analysis, analyzedAt: new Date(), topics: analysis.topics.slice(0, 5), format: analysis.format } });
      return text("saved");
    } catch (err) { return fail(err); }
  });

  server.registerTool("save_insights_summary", { title: "Save insights summary", description: "Store the narrative summary (what's working, what isn't, actions) shown on the brand's Overview tab.", inputSchema: z.object({ brandId: z.string(), narrative: InsightsSummarySchema }) }, async ({ brandId, narrative }, extra) => {
    try {
      const actor = await brandFor(await mcpUser(extra), brandId);
      const stats = await computeStats(actor.id);
      const summary = { computedAt: stats.computedAt, kpis: stats.kpis, bestSlots: stats.bestSlots, narrative, calibration: await computeCalibration(actor.id), source: "mcp" };
      await prisma.actor.update({ where: { id: actor.id }, data: { insightsSummary: summary } });
      await settleRecommendations(actor.id);
      return text("saved");
    } catch (err) { return fail(err); }
  });

  server.registerTool("save_design_system", { title: "Save design system", description: "Store a design system + caption style as a new version. Influenci's captions and generated images follow it.", inputSchema: z.object({ brandId: z.string(), designSystem: DesignSystemSchema }) }, async ({ brandId, designSystem }, extra) => {
    try {
      const actor = await brandFor(await mcpUser(extra), brandId);
      const saved = await saveDesignSystem(actor.id, { ...designSystem, source: "mcp" });
      return json({ version: saved.version });
    } catch (err) { return fail(err); }
  });

  server.registerTool("add_recommendations", { title: "Add recommendations", description: "Add recommended posts (with predicted score 1-10, reach range, ER and rationale) to the brand's library. Predictions are clamped to the brand's real baselines; get_stats shows them.", inputSchema: z.object({ brandId: z.string(), recommendations: RecommendationsSchema.shape.recommendations.max(15) }) }, async ({ brandId, recommendations }, extra) => {
    try {
      const actor = await brandFor(await mcpUser(extra), brandId);
      const baselines = predictionBaselines(await computeStats(actor.id));
      const batchId = `mcp_${Date.now()}`;
      const created = [];
      for (const raw of recommendations) {
        const rec = clampPrediction(raw, baselines);
        const row = await prisma.recommendation.create({ data: { actorId: actor.id, batchId, kind: "post", platforms: rec.platforms, format: rec.format, title: rec.title.slice(0, 120), concept: rec.concept, hook: rec.hook, caption: rec.caption, hashtags: rec.hashtags.map((h) => h.replace(/^#/, "")), visualBrief: rec.visualBrief, bestTime: rec.bestTime, predictedScore: rec.predictedScore, predictedReachLow: rec.predictedReachLow, predictedReachHigh: rec.predictedReachHigh, predictedEngagementRate: rec.predictedEngagementRate, confidence: rec.confidence, rationale: rec.rationale, basedOn: { ownPosts: rec.basedOnOwnPosts, benchmarks: rec.basedOnBenchmarks, seasonalHook: rec.seasonalHook || null, source: "mcp" } } });
        created.push({ id: row.id, title: row.title, predictedScore: row.predictedScore });
      }
      await logEvent({ actorId: actor.id, kind: "recommend", step: "mcp_batch", message: `${created.length} recommendations`, data: { batchId } });
      return json({ batchId, created });
    } catch (err) { return fail(err); }
  });

  server.registerTool("create_post", { title: "Create post", description: "Turn a recommendation (or a caption + visual brief) into a brand post. With preview: true (recommended) Influenci only renders the image/video: no platforms, no date, nothing can publish; show the user the keyframeUrl from get_post, then call schedule_post. Without preview it is scheduled straight away as a draft for approval in the calendar.", inputSchema: z.object({ brandId: z.string(), recommendationId: z.string().optional(), preview: z.boolean().default(true).describe("Render only; schedule later with schedule_post"), platforms: z.array(z.enum(["instagram", "facebook", "facebook_group"])).default(["facebook"]), scheduledAt: z.string().optional().describe("ISO date-time; defaults to the recommendation's best time"), caption: z.string().optional(), hashtags: z.array(z.string()).optional(), title: z.string().optional(), format: z.enum(["image", "carousel", "reel", "video", "graphic"]).optional(), visualBrief: z.object({ subject: z.string(), composition: z.string().optional(), overlayText: z.string().optional(), palette: z.array(z.string()).optional(), notes: z.string().optional(), template: z.enum(["winner", "contender", "throwback", "question"]).optional(), fields: z.record(z.string(), z.string()).optional(), photoUrl: z.string().optional() }).optional(), referenceImages: z.array(z.string()).optional() }) }, async (args, extra) => {
    try {
      const user = await mcpUser(extra);
      const actor = await brandFor(user, args.brandId);
      let rec = args.recommendationId ? await prisma.recommendation.findFirst({ where: { id: args.recommendationId, actorId: actor.id } }) : null;
      if (args.recommendationId && !rec) return fail("Recommendation not found");
      if (rec?.postId) return fail("A post was already created from this recommendation");
      if (!rec) {
        if (!args.caption) return fail("Give a caption or a recommendationId");
        rec = await prisma.recommendation.create({ data: { actorId: actor.id, kind: "post", status: "saved", platforms: args.platforms, format: args.format || "image", title: (args.title || args.caption).slice(0, 120), concept: args.caption.slice(0, 2000), hook: args.title || null, caption: args.caption, hashtags: (args.hashtags || []).map((h) => h.replace(/^#/, "")), visualBrief: args.visualBrief || { subject: args.caption.slice(0, 120) }, basedOn: { source: "mcp_direct" } } });
      } else if (args.visualBrief) {
        rec = await prisma.recommendation.update({ where: { id: rec.id }, data: { visualBrief: { ...(rec.visualBrief || {}), ...args.visualBrief } } });
      }
      const post = await createPostFromRecommendation(rec, { platforms: args.platforms, date: args.scheduledAt, referenceImages: args.referenceImages || [], userId: user.id, preview: args.preview !== false });
      if (args.preview !== false) return json({ postId: post.id, recommendationId: rec.id, status: post.status, preview: true, next: "Poll get_post until keyframeUrl/videoUrl is set, show it to the user, then schedule_post or discard_preview", compliance: post.compliance });
      return json({ postId: post.id, status: post.status, planDate: post.planDate, targets: post.targets.map((t) => ({ platform: t.platform, scheduledAt: t.scheduledAt })), calendar: `/calendar?post=${post.id}`, compliance: post.compliance });
    } catch (err) { return fail(err); }
  });

  server.registerTool("schedule_post", { title: "Schedule a previewed post", description: "Final step after a preview the user approved: add platforms and a date. The post moves to the calendar as a draft that still needs approval before publishing.", inputSchema: z.object({ recommendationId: z.string(), platforms: z.array(z.enum(["instagram", "facebook", "facebook_group"])).default(["facebook"]), scheduledAt: z.string().optional().describe("ISO date-time; defaults to the recommendation's best time") }) }, async ({ recommendationId, platforms, scheduledAt }, extra) => {
    try {
      const user = await mcpUser(extra);
      const rec = await prisma.recommendation.findFirst({ where: { id: recommendationId, actor: { userId: user.id } } });
      if (!rec) return fail("Recommendation not found");
      const post = await schedulePreviewPost(rec, { platforms, date: scheduledAt, userId: user.id });
      return json({ postId: post.id, status: post.status, planDate: post.planDate, targets: post.targets.map((t) => ({ platform: t.platform, scheduledAt: t.scheduledAt })), calendar: `/calendar?post=${post.id}`, compliance: post.compliance });
    } catch (err) { return fail(err); }
  });

  server.registerTool("discard_preview", { title: "Discard a preview", description: "Throw away a previewed post the user did not like; the recommendation stays in the library.", inputSchema: z.object({ recommendationId: z.string() }) }, async ({ recommendationId }, extra) => {
    try {
      const user = await mcpUser(extra);
      const rec = await prisma.recommendation.findFirst({ where: { id: recommendationId, actor: { userId: user.id } } });
      if (!rec) return fail("Recommendation not found");
      await discardPreviewPost(rec, { userId: user.id });
      return text("discarded");
    } catch (err) { return fail(err); }
  });

  server.registerTool("approve_post", { title: "Approve or cancel post", description: "Approve a rendered draft (queues it for publishing at its scheduled time) or cancel it.", inputSchema: z.object({ postId: z.string(), action: z.enum(["approve", "cancel", "draft"]) }) }, async ({ postId, action }, extra) => {
    try {
      const user = await mcpUser(extra);
      const post = await prisma.post.findFirst({ where: { id: postId, userId: user.id } });
      if (!post) return fail("Post not found");
      if (action === "approve") {
        if (!post.videoUrl && !post.keyframeUrl) return fail("Post is not rendered yet");
        await prisma.post.update({ where: { id: post.id }, data: { status: "approved", approvedAt: new Date(), approvedBy: user.id } });
        await prisma.postTarget.updateMany({ where: { postId: post.id, status: "pending" }, data: { status: "queued" } });
      } else if (action === "cancel") {
        await prisma.post.update({ where: { id: post.id }, data: { status: "cancelled" } });
        await prisma.postTarget.updateMany({ where: { postId: post.id, status: { in: ["pending", "queued"] } }, data: { status: "cancelled" } });
      } else {
        await prisma.post.update({ where: { id: post.id }, data: { status: "draft", approvedAt: null, approvedBy: null } });
        await prisma.postTarget.updateMany({ where: { postId: post.id, status: "queued" }, data: { status: "pending" } });
      }
      return text(action);
    } catch (err) { return fail(err); }
  });

  server.registerTool("create_actor_post", { title: "Create AI actor post", description: "For AI persona actors: supply the idea, script and per-platform captions you wrote; Influenci renders the keyframe/video and schedules it.", inputSchema: z.object({ actorId: z.string(), idea: z.string(), hook: z.string(), pillar: z.string().optional(), mediaType: z.enum(["video", "image"]).default("video"), clipLengthSec: z.enum(["5", "10"]).default("5"), script: z.object({ hook: z.string(), scene: z.string(), action: z.string(), dialogue: z.string(), onScreenText: z.string(), keyframePrompt: z.string(), motionPrompt: z.string(), sound: z.string(), wardrobe: z.string() }).optional(), captions: z.record(z.string(), z.object({ caption: z.string().optional(), title: z.string().optional(), description: z.string().optional(), text: z.string().optional(), hashtags: z.array(z.string()).optional() })).optional(), date: z.string().optional().describe("YYYY-MM-DD in the actor's timezone") }) }, async (args, extra) => {
    try {
      const user = await mcpUser(extra);
      const actor = await prisma.actor.findFirst({ where: { id: args.actorId, userId: user.id, kind: { not: "brand" } } });
      if (!actor) return fail("Actor not found");
      if (!actor.imageUrl) return fail("Actor has no reference image");
      const tz = actor.timezone || "America/New_York";
      const planDate = /^\d{4}-\d{2}-\d{2}$/.test(args.date || "") ? args.date : todayIn(tz);
      const last = await prisma.post.findFirst({ where: { actorId: actor.id, planDate }, orderBy: { sequence: "desc" } });
      const now = Date.now();
      const slots = slotsForDay(actor, planDate).filter((s, i, arr) => arr.findIndex((x) => x.platform === s.platform) === i);
      const disclosure = actor.bible?.aiDisclosure || "AI-generated character";
      const clipLengthSec = args.clipLengthSec === "10" ? 10 : 5;
      const post = await prisma.post.create({
        data: {
          actorId: actor.id, userId: user.id, planDate, sequence: Math.max((last?.sequence ?? 99) + 1, 100), mediaType: args.mediaType, clipLengthSec, status: "planned", idea: args.idea, pillar: args.pillar || null, hook: args.hook,
          script: args.script ? { ...args.script, durationSec: clipLengthSec } : null,
          targets: { create: slots.map((s) => { const v = args.captions?.[s.platform] ? enforceLimits(s.platform, args.captions[s.platform], disclosure) : null; return { platform: s.platform, slotIndex: 100, scheduledAt: s.scheduledAt.getTime() > now ? s.scheduledAt : new Date(now + 30 * 60 * 1000), status: "pending", ...(v ? { caption: v.caption, title: v.title, hashtags: v.hashtags } : {}) }; }) },
        },
      });
      const { start } = await import("workflow/api");
      const { renderPostWorkflow } = await import("@/workflows/render-post");
      const run = await start(renderPostWorkflow, [post.id]);
      await prisma.post.update({ where: { id: post.id }, data: { renderRunId: run.runId } });
      return json({ postId: post.id, planDate, calendar: `/calendar?post=${post.id}` });
    } catch (err) { return fail(err); }
  });

  server.registerTool("render_card", { title: "Render brand card", description: `Composite a branded card image for free (no AI, no render credits) from the brand templates: ${Object.entries(TEMPLATES).map(([k, t]) => `${k} (${t.fields.map((f) => f.key + (f.required ? "*" : "")).join(", ")}${t.photo ? ", photoUrl* JPEG/PNG" : ""})`).join("; ")}. Returns the image URL. To post it, call create_post with visualBrief { template, fields, photoUrl } and a caption.`, inputSchema: z.object({ brandId: z.string(), template: z.enum(["winner", "contender", "throwback", "question"]), fields: z.record(z.string(), z.string()).default({}), photoUrl: z.string().optional().describe("https URL of the hunter's photo (JPEG or PNG); required for winner/contender/throwback") }) }, async ({ brandId, template, fields, photoUrl }, extra) => {
    try {
      const actor = await brandFor(await mcpUser(extra), brandId);
      const card = await renderCardToBlob({ actor, template, fields, photoUrl: photoUrl || null });
      return json({ url: card.url, template: card.template, fields: card.fields, bytes: card.bytes, next: "create_post with visualBrief { template, fields, photoUrl } + caption" });
    } catch (err) { return fail(err); }
  });

  server.registerTool("rescore", { title: "Re-score brand", description: "Recompute 1-10 scores for all of a brand's posts (after recording new posts or changing follower counts).", inputSchema: z.object({ brandId: z.string() }) }, async ({ brandId }, extra) => {
    try {
      const actor = await brandFor(await mcpUser(extra), brandId);
      return json(await rescoreActor(actor.id));
    } catch (err) { return fail(err); }
  });
}
