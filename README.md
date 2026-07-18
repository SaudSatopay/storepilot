# StorePilot

StorePilot is an AI store manager for small retailers. This scaffold starts the hackathon MVP with a mocked Morning Brief feed and chat desk, ready for the Prisma seed data and OpenAI tool-calling prompts that come next.

## Stack

- Next.js 15 App Router
- TypeScript
- Tailwind CSS
- Prisma with Postgres
- OpenAI SDK

## Getting Started

```bash
pnpm install
cp .env.example .env
pnpm db:local
pnpm db:seed
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to view the scaffold.

## Environment

Set `DATABASE_URL` to a Postgres connection string and `OPENAI_API_KEY` to your OpenAI API key. `OPENAI_MODEL` defaults to `gpt-5.6`.

For local development without Docker, `pnpm db:local` starts a PGlite Postgres-compatible server on port `5433`. The seed script creates a 90-day demo electronics store with 120 products, suppliers, sales, and stock levels. Check the database with [http://localhost:3000/api/health](http://localhost:3000/api/health).

## Tools Layer

The server-side tools live in `lib/tools`: `query_sales`, `get_inventory`, `forecast_stockouts`, `compose_supplier_message`, and `draft_promo`. Inputs are validated with zod and database access goes through Prisma query builders.

```bash
pnpm test
```

## Agent Chat

`/api/chat` accepts chat messages, calls StorePilot tools through the OpenAI Responses API, streams answer deltas as NDJSON, and emits evidence chips for the numbers behind each recommendation. If `OPENAI_API_KEY` is unset or still a placeholder, the route uses seeded demo data so `What should I reorder this week?` stays testable offline.
