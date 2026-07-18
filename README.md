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
pnpm prisma generate
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to view the scaffold.

## Environment

Set `DATABASE_URL` to a Postgres connection string and `OPENAI_API_KEY` to your OpenAI API key. `OPENAI_MODEL` defaults to `gpt-5.6`.
