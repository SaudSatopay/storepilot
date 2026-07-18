# StorePilot

**The AI store manager for small retailers.** Most of the world's small shops run on gut feeling: no analyst, no demand planning, no time. StorePilot reads the store's sales and inventory every morning, tells the owner the three things that actually need doing today, then drafts the messages that do them.

Built for OpenAI Build Week 2026 (Work & Productivity track) with GPT-5.6 and Codex.

## What it does

- **Morning Brief.** A deterministic analysis engine scans the store's own data every morning: revenue pace against the typical weekday, category-level anomaly detection, stockout forecasting from live velocity, and slow movers tying up cash. GPT-5.6 then writes the briefing from those verified facts using structured outputs, so the copy is sharp and the numbers are never hallucinated.
- **Ask StorePilot.** An agentic chat over the store database. GPT-5.6 decides which tools to call (`query_sales`, `get_inventory`, `forecast_stockouts`, `compose_supplier_message`, `draft_promo`), the server executes them with zod-validated inputs through Prisma, and answers stream back with evidence chips showing the numbers behind every claim.
- **One-tap actions.** The stockout card becomes a WhatsApp-ready supplier reorder message, grouped by supplier with recommended quantities, in two clicks. Slow movers become promo copy with a discount and channel picker. Everything is editable and copies to the clipboard; nothing sends without the owner pasting it.

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 15 App Router, TypeScript, Tailwind CSS 4 |
| Database | Postgres via Prisma (PGlite locally, Neon in production) |
| AI | OpenAI Responses API, GPT-5.6, function tools + structured outputs |
| Tests | Vitest (forecast math, schema validation, brief analysis) |
| Typography | Fraunces, Schibsted Grotesk, Spline Sans Mono |

## Quickstart

```bash
pnpm install
cp .env.example .env        # then put your real OPENAI_API_KEY in .env
pnpm db:local               # starts a PGlite Postgres server on :5433 (keep it running)
pnpm db:seed                # 90 days of demo data for Cedar Electronics
pnpm dev
```

Open http://localhost:3000. Check the data with http://localhost:3000/api/health.

Without a real `OPENAI_API_KEY`, the app stays fully functional in a local demo mode: the brief uses the deterministic template copy and chat answers from canned grounded branches. With the key set, GPT-5.6 writes the brief and drives the chat with real tool calling. The brief panel shows which mode produced it.

## How the AI is wired

```
Morning Brief   /api/brief    analyze (pure fns) -> compose (facts) -> GPT-5.6 rewrite (json_schema)
Chat            /api/chat     GPT-5.6 tool loop -> zod-validated tools -> Prisma -> NDJSON stream
Actions         /api/actions  compose_supplier_message / draft_promo, no model needed
```

The design principle: **the model narrates, deterministic code calculates.** Forecasts, anomalies, and quantities come from tested math over real rows; GPT-5.6 chooses tools, explains, and writes. Every number in the UI is traceable to a query.

## Demo data

`pnpm db:seed` builds a deterministic 90-day electronics store (fixed RNG seed): 120 SKUs across 9 categories, 6 suppliers, weekly seasonality with weekend peaks, a planted category spike (check the anomaly card), two products burning toward stockout, and three products trending down with excess stock. Reseed any time; the stories stay stable.

## Deploy (Vercel + Neon)

1. Create a Neon Postgres database and copy the pooled connection string.
2. `vercel env add DATABASE_URL` (the Neon URL), `OPENAI_API_KEY`, `OPENAI_MODEL=gpt-5.6`, `NEXT_PUBLIC_APP_URL` (your production URL).
3. Push and import the repo in Vercel. Build command stays `next build`.
4. Seed production once: `DATABASE_URL=<neon-url> pnpm db:seed`.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js dev, production build, serve |
| `pnpm db:local` | Local PGlite Postgres on :5433 |
| `pnpm db:seed` | Push schema + seed demo store |
| `pnpm test` | Vitest suite |
| `pnpm lint` | ESLint |

## Project layout

```
app/
  page.tsx               Morning Brief + chat desk (client)
  components/            Action modals (reorder, promo)
  api/brief              Brief generation endpoint
  api/chat               Streaming agentic chat endpoint
  api/actions/*          One-tap action endpoints
  api/health             Row counts + data span
lib/
  brief/                 analyze (pure math) + compose (copy) + generate (model rewrite)
  tools/                 The 5 agent tools, zod schemas, forecast math
  openai.ts prisma.ts errors.ts
prisma/
  schema.prisma seed.ts
```

## License

MIT
