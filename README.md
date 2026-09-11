# Influenci

AI influencer video studio at [app.influenci.ai](https://app.influenci.ai). Create reusable **AI actors** from a reference photo, then turn scripts into UGC-style clips: image-to-video, text-to-video, and talking-actor videos with a generated voice.

Built on the MIT-licensed [Open AI UGC](https://github.com/Anil-matcha/Open-AI-UGC) studio (Next.js 16, Prisma, NextAuth) with a pluggable provider layer.

## Providers

| Provider | Cost | What it gives |
|---|---|---|
| **Wavespeed** (default) | $1 free on signup, then ~$0.15 per 5 s clip | Wan 2.2 image/text-to-video, InfiniteTalk talking actors |
| **MUAPI** | small free grant, then per video | Veo 3.1, Seedance 2, Grok Video, Happy Horse |
| **Free (community GPU)** | $0 | Hugging Face ZeroGPU Spaces: Wan 2.2, LTX, LatentSync lip-sync. ~5 GPU-min/day, slow, best-effort |

Voiceovers for talking actors use Microsoft Edge's neural TTS via `msedge-tts` (free, no key).

Users pay with credits (1 credit = $0.005) drawn from the server's keys, or bring their own Wavespeed/MUAPI key and pay the provider directly.

## Stack

- Next.js 16 App Router, React 19, Tailwind v4
- Prisma 7 + Postgres (Neon via Vercel Marketplace)
- NextAuth (Google)
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
src/app/                Ad Builder (/), AI Actors (/actors), Final Videos (/gallery), Pricing
```

## Adding a provider

Create `src/lib/providers/<name>.js` exporting `{ id, label, envKey, allowUserKey, models, submit(), status() }` (see the contract at the top of `src/lib/providers/index.js`) and register it in `PROVIDERS`.

## License

MIT, same as the upstream project.
