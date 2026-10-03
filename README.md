# GeoLocator — AI-Powered Photo Geolocation

Upload a photo, pay **100 sats** via Lightning Network, and a configurable vision model identifies the **top 3 most likely locations** the photo was taken.

## Stack

- **Next.js 16** (App Router)
- **@moneydevkit/nextjs** — Lightning Network checkout loop
- **Provider-agnostic vision layer** — Gemini, OpenAI, Qwen adapters
- **Neon Postgres + Drizzle** — production config, usage logs, playground, benchmarks
- **Vercel Blob** — private benchmark images only
- **shadcn/ui** — component design
- **Vercel** — deployment

## Setup

### 1. Clone and install

```bash
git clone <repo>
cd mdk
npm install
```

### 2. Environment variables

```bash
cp .env.local.example .env.local
```

| Variable | Purpose |
|---|---|
| `MDK_ACCESS_TOKEN` | [moneydevkit.com/dashboard](https://moneydevkit.com/dashboard) |
| `MDK_MNEMONIC` | Same as above |
| `GEMINI_API_KEY` | [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) |
| `OPENAI_API_KEY` | Optional — OpenAI playground/benchmarks |
| `QWEN_API_KEY` | Optional — Qwen (DashScope) playground/benchmarks |
| `ADMIN_SECRET` | Password for `/admin` (server-only) |
| `DATABASE_URL` | Neon Postgres connection string |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob token (benchmark images) |

### 3. Database

```bash
npm run db:push
```

The first production request (or opening Production admin) seeds a Gemini production config with the default geolocation prompt.

### 4. Run locally

```bash
npm run dev
```

For local Lightning payments you need to expose your dev server:

```bash
ngrok http 3000
```

Then set your app URL in the [MDK dashboard](https://moneydevkit.com/dashboard) to `https://<your-ngrok-id>.ngrok-free.app`.

## Admin (`/admin`)

Single-operator area protected by `ADMIN_SECRET` (HTTP-only session cookie).

Sections:

- **Overview** — production request volume, cost, latency, errors by model
- **Production** — live provider/model/prompt/settings (applies immediately)
- **Playground** — side-by-side multi-model comparison + manual ratings
- **Benchmarks** — private ground-truth dataset, accuracy/cost/latency runs

## Deploy to Vercel

```bash
vercel deploy
```

Add the environment variables in your Vercel project settings, run `npm run db:push` against the Neon database, and set your app URL in the MDK dashboard.

## Privacy

- **Production** images are **never stored** server-side. Usage logs contain metadata only (tokens, latency, cost, errors).
- **Benchmark** images are intentionally retained in private Blob storage for admin evaluation only.
