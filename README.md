# Conto

A personal finance app that gives you honest visibility into your money, without linking to your bank. Upload statements and payslips, and Conto traces money through transfers, credit-card payments, and reclassifications until the picture is coherent — then helps you plan: savings goals, subscription audits, tax outcomes, and trade-offs like *"how do I afford a $40/week gym membership without hurting my bottom line?"*

## Status

Phase 0 — foundation.

## Documentation

- [`/docs/PLAN.md`](docs/PLAN.md) — full planning document: architecture, data model, build phases.
- [`CLAUDE.md`](CLAUDE.md) — short conventions file for Claude Code sessions.
- [`/docs/adr/`](docs/adr/) — architectural decision records.

## Stack

Next.js · TypeScript · Postgres · Drizzle · Tailwind · shadcn/ui · pg-boss · Cloudflare R2.

## Getting started

Prerequisites: Node 20+, Docker, a Cloudflare R2 bucket.

```bash
cp .env.example .env
# fill in DATABASE_URL, BETTER_AUTH_SECRET, R2_*

docker compose up -d              # Postgres on localhost:5432
npm install
npm run db:migrate                # apply migrations
npm run db:seed                   # seed AU subcategories

# In separate terminals:
npm run dev                       # web on :3000
npm run worker:dev                # worker process
```

Visit http://localhost:3000 → sign up → upload a file → see the worker log the no-op job.

### Tests

```bash
npm test                          # Vitest unit + integration
npm run test:e2e                  # Playwright (auto-starts dev + worker)
```

## License

_TBD._
