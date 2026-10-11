# Influenci

AI influencer video studio at [app.influenci.ai](https://app.influenci.ai). Create reusable **AI actors** from a reference photo, then turn scripts into UGC-style clips: image-to-video, text-to-video, and talking-actor videos with a generated voice.

Built on the MIT-licensed [Open AI UGC](https://github.com/Anil-matcha/Open-AI-UGC) studio (Next.js 16, Prisma) with Clerk auth and a pluggable provider layer.

## Providers

| Provider | Cost | What it gives |
|---|---|---|
| **Wavespeed** (default) | $1 free on signup, then ~$0.15 per 5 s clip | Wan 2.2 image/text-to-video, InfiniteTalk talking actors |
| **MUAPI** | small free grant, then per video | Veo 3.1, Seedance 2, Grok Video, Happy Horse |
| **Free (community GPU)** | $0 | Hugging Face ZeroGPU Spaces: Wan 2.2, LTX, LatentSync lip-sync. ~5 GPU-min/day, slow, best-effort |

Voiceovers for talking actors use Microsoft Edge's neural TTS via `msedge-tts` (free, no key).

Users pay with credits (1 credit = $0.005) drawn from the server's keys, or bring their own Wavespeed/MUAPI key and pay the provider directly.

## Brand accounts

Besides AI personas, Influenci manages **real brand accounts** (`/accounts`): connect a Facebook Page and the Instagram professional account linked to it with one Meta login, import the full post history with likes, comments, shares, saves, reach and views, and the app:

- scores every post **1–10** (50 % rank inside the account, 30 % industry engagement bands, 20 % reach rate; posts under 72 h are provisional),
- analyses each post with Claude vision (format, subject, hook, overlay, palette, CTA, why it worked),
- builds a dashboard and printable report (KPIs, reach trend, ER by format, best time to post, Claude's "what's working / do next"),
- extracts an editable, versioned **design system + caption style** from the top posts and proposes changes as new posts come in,
- recommends new posts with a predicted score and reach range, grounded in our stats, hunting/fishing competitor benchmarks, the outdoor seasonal calendar and past prediction accuracy,
- turns a recommendation into a brand-styled image or reel in two steps: **Preview** renders it with no date and no platforms (it cannot publish), then **Schedule** adds the platforms and time and puts it in the calendar as a draft for approval; after publishing to Instagram/Facebook it reads the metrics back so predictions get calibrated,
- composites the brand's own card formats (winner, contender, throwback, question) for free from templates (`src/lib/render/templates/apex-card.js`, satori + resvg): Recommend tab → "Make a brand card", MCP `render_card`, or `create_post` with `visualBrief.template`.

Because the Pages are ones you administer, Meta's Standard Access is enough: no App Review is needed. Daily syncs run from the scheduler ticker.

A private **Facebook group** is a second surface (`facebook_group`): Meta retired the Groups API, so group posts come in as screenshots, are scored against the member count, get their own recommendations (Recommend tab → Group filter), and are posted by hand from the calendar (copy caption, download image, mark as posted). Member posts are stored as community benchmarks, not as the brand's posts.

No Meta app yet? The Posts tab imports **screenshots** of posts (Claude reads caption, date, likes, comments, shares), and `/accounts` has a one-click Apex Outdoor Rewards quick start.

## Claude connector (MCP) — run the AI on your Claude subscription

Influenci is also a remote **MCP server** at `/api/mcp`, so Claude.ai, Claude Desktop and Claude Code can read a brand's stats and write back analyses, design systems, recommendations and posts under your Max/Team subscription instead of the pay-per-token `ANTHROPIC_API_KEY`.

1. Clerk Dashboard → select the environment the site runs on (Development when `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` starts with `pk_test`) → Configure → Developers → **OAuth applications** → **Settings** → turn on **Publish DCR support**. Leave **Publish CIMD support** off: Clerk cannot resolve Claude's hosted client document and the sign-in fails with `invalid_client`. Keep *Require PKCE* on and *Opaque access tokens* selected.
2. Claude.ai → Settings → Connectors → **Add custom connector** → `https://app.influenci.ai/api/mcp` (no trailing dot) → Authentication *Sign in now*, OAuth client *Register automatically* → Add → Connect → sign in with your Influenci account.
   Claude Code: `claude mcp add --transport http influenci https://app.influenci.ai/api/mcp`.
3. Settings → Platform apps → **AI** → choose *Claude subscription*. The import workflow then skips the server-side Claude steps and the Overview, Design, Recommend and Posts tabs show "Do this in Claude" with the prompt to run.

Tools: `list_brands`, `get_brand`, `list_posts`, `get_post`, `get_stats`, `list_benchmarks`, `get_seasonality`, `list_recommendations`, `list_scheduled`, `list_actors`, `record_posts` (screenshots transcribed in chat), `record_benchmark_posts`, `save_post_analysis`, `save_insights_summary`, `save_design_system`, `add_recommendations`, `create_post`, `approve_post`, `create_actor_post`, `rescore`. Prompts: `import-screenshots`, `weekly-review`, `analyze-posts`, `extract-design-system`, `recommend-posts`, `write-winner-post`. Every call is scoped to the signed-in user's brands.

## Stack

- Next.js 16 App Router, React 19, Tailwind v4
- Prisma 7 + Postgres (Neon via Vercel Marketplace)
- Clerk for sign-in (email code, password, or social), via the Vercel Marketplace
- Vercel Blob for uploads (direct browser uploads, no 4.5 MB limit)
- Stripe credit packs (optional)

## Local development

```bash
pnpm install
vercel link && vercel env pull .env.local   # or copy .env.example to .env.local
pnpm prisma migrate deploy
pnpm dev
```

Environment variables are documented in [`.env.example`](.env.example).

## Layout

```
src/lib/providers/      adapters: wavespeed.js, muapi.js, zerogpu.js (+ index.js registry)
src/lib/tts.js          edge-tts -> Vercel Blob
src/app/api/generate    submit a job (reserves credits, calls adapter, background run for free provider)
src/app/api/creations   list / status-poll / delete renders
src/app/api/actors      saved AI actors CRUD
src/app/api/upload      Vercel Blob client-upload token exchange
src/app/api/webhook     MUAPI completion callback (secret-protected)
src/app/                Ad Builder (/), AI Actors (/actors), Brand Accounts (/accounts), Calendar, Final Videos (/gallery), Pricing
src/lib/social/meta.js  Facebook Page + Instagram connector (OAuth, history, insights, publishing)
src/lib/insights/       scoring (1-10), stats, Claude post analysis, summary, design system, recommendations, seasonality
src/workflows/import-channel.js  durable history import / daily sync
```

Run the unit tests with `pnpm test` (vitest).

## Adding a provider

Create `src/lib/providers/<name>.js` exporting `{ id, label, envKey, allowUserKey, models, submit(), status() }` (see the contract at the top of `src/lib/providers/index.js`) and register it in `PROVIDERS`.

## License

MIT, same as the upstream project.
