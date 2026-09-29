# LeadForge — AI-Powered Lead Generation CRM

A dark-premium, full-stack lead-gen CRM built on Next.js 16. Generates leads
from web search, qualifies them with Gemini AI (with ZAI fallback), enriches
their portfolio, and writes personalized outreach messages.

## Features

- **Two niches**: E-commerce/SMB leads **and** Author leads (with book title + themes + book-specific hooks)
- **Web-search discovery**: Pulls real leads from the web via `z-ai-web-dev-sdk`
- **Gemini AI confirmation**: Each lead is validated, scored 0-100, and summarized before showing
- **Portfolio enrichment**: Reads the lead's website to extract emails, socials, projects
- **Author book extraction**: For author leads, Gemini extracts the most recent book title + themes + a specific concrete "hook" detail to use in outreach
- **5 message types**: Cold Email, LinkedIn DM, Follow-up, WhatsApp/SMS, Pitch/Proposal
- **Book-aware author templates**: Each author message references a specific concrete detail from the book — not generic praise
- **Pipeline kanban**: New → Contacted → Qualified → Won → Lost with drag-and-drop status mover
- **Filter bar**: Filter by search query, location, industry, company size, AI score, status
- **Automation rules**: Auto-enrich on save, auto-advance new → contacted after 24h, auto-create follow-up tasks
- **Settings**: Paste your own Gemini API key (stored in browser localStorage, never persisted server-side)

## Tech Stack

- Next.js 16 (App Router, Turbopack)
- TypeScript 5
- Tailwind CSS 4 + shadcn/ui (New York style)
- Prisma ORM (SQLite locally, Cloudflare D1 in production)
- `z-ai-web-dev-sdk` for web search + page reader + chat fallback
- Google Gemini API (`gemini-3.8-flash`) with automatic ZAI fallback when geo-blocked

## Quick Start (Local Dev)

```bash
bun install          # install deps
cp .env.example .env # set DATABASE_URL=file:./db/custom.db
bun run db:push      # create SQLite schema
bun run db:generate  # generate Prisma client
bun run dev         # start dev server on :3000
```

Open http://localhost:3000, click **Settings**, paste your Gemini API key
(get one free at https://aistudio.google.com/apikey), then go to **Discover**
and search for "Shopify skincare stores" or "debut literary fiction authors".

## Deployment

### GitHub

```bash
git remote add origin git@github.com:YOUR_USERNAME/leadforge.git
git push -u origin main
```

### Cloudflare Pages (with D1)

The app is configured for Cloudflare Pages + D1. See `wrangler.toml` and
`DEPLOY.md` for full instructions.

**Important constraint**: `z-ai-web-dev-sdk` reads its config from a file at
runtime. On Cloudflare's edge runtime, this requires either:
1. Setting the config via environment variables and patching the SDK
2. Removing the web-search and ZAI-fallback features (Gemini calls still work
   since Cloudflare's edge is global — Gemini is reachable from most edge PoPs)

See `DEPLOY.md` for the recommended deployment path.

## Project Structure

```
prisma/schema.prisma        # Lead, Message, Task, AutomationRule, AutomationLog models
src/app/page.tsx            # Main dashboard UI (~1650 lines)
src/lib/db.ts               # Prisma client — auto-detects D1 vs SQLite
src/lib/gemini.ts           # Gemini + ZAI fallback chain + mock dispatcher
src/lib/lead-search.ts      # z-ai-web-dev-sdk wrapper (web_search + page_reader)
src/app/api/leads/          # Lead CRUD + search + enrich + messages + tasks
src/app/api/automation/     # Automation rules + run endpoint
```

## License

MIT — see `LICENSE` file (or just use it however you want).
