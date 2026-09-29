# Deployment Guide — LeadForge to Cloudflare Pages + D1

This guide walks through deploying LeadForge to Cloudflare Pages with a D1
database. The deployment has three known constraints; this doc explains each
and the recommended workaround.

## Constraints

### 1. SQLite file does not work on Cloudflare's edge runtime

Cloudflare Pages/Workers are serverless V8 isolates — no Node.js `fs` module.
The local SQLite file (`db/custom.db`) used in dev won't be readable in
production. **Solution: migrate to Cloudflare D1** (native SQLite on the edge).

### 2. `z-ai-web-dev-sdk` reads config from file

The ZAI SDK (`z-ai-web-dev-sdk`) reads its config from `./.z-ai-config`,
`~/.z-ai-config`, or `/etc/.z-ai-config` at runtime. On Cloudflare, none of
these paths exist. **Affected features:**

- Lead discovery (uses `web_search`)
- Portfolio enrichment (uses `page_reader`)
- ZAI chat fallback (used when Gemini is geo-blocked from HK server)

**Workarounds:**

- **Option A (recommended)**: Run a separate Node.js worker (e.g. on Railway
  or Fly.io) that handles the ZAI-backed routes, and Cloudflare Pages handles
  the rest. Hybrid deployment.
- **Option B**: Refactor `src/lib/lead-search.ts` and `src/lib/gemini.ts`
  to call ZAI's HTTP API directly using env vars (more work, but cleaner).
- **Option C**: Skip the ZAI-backed features on Cloudflare. Only the direct
  Gemini API calls will work — and since Cloudflare's edge is global, Gemini
  is reachable from most edge PoPs (no HK geo-block).

### 3. Next.js 16 is very new

`@cloudflare/next-on-pages` may emit peer-dependency warnings. It currently
works with Next.js 16.x but Cloudflare's official support lags ~1 minor version.

## Recommended Deployment Path

### Step 1: Push to GitHub

```bash
git remote add origin https://github.com/YOUR_USERNAME/leadforge.git
git push -u origin main
```

### Step 2: Create Cloudflare D1 Database

Install `wrangler` CLI:

```bash
bun add -g wrangler
wrangler login  # opens browser for OAuth
```

Create the D1 database:

```bash
wrangler d1 create leadforge-db
```

This prints a `database_id`. Paste it into `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "leadforge-db"
database_id = "PASTE_ID_HERE"  # ← replace
```

### Step 3: Generate D1 migration from Prisma schema

```bash
# Generate SQL migration from Prisma schema
bunx prisma migrate diff \
  --from-empty \
  --to-schema-datamodel prisma/schema.prisma \
  --script > prisma/migrations/0001_init.sql

# Apply to D1 (preview environment)
wrangler d1 execute leadforge-db --remote --file=prisma/migrations/0001_init.sql
```

### Step 4: Build for Cloudflare Pages

```bash
# Build the Next.js app + convert to Cloudflare Pages format
bunx @cloudflare/next-on-pages
# Output goes to `.vercel/output/static/` (Cloudflare Pages expects this)
```

### Step 5: Deploy via Wrangler

```bash
# Deploy to Cloudflare Pages
wrangler pages deploy .vercel/output/static --project-name=leadforge
```

Or connect the GitHub repo to Cloudflare Pages via the dashboard for auto-deploy
on every push.

### Step 6: Set environment variables

In the Cloudflare Pages dashboard, set:

- `NODE_ENV` = `production`
- (Optional) `GEMINI_API_KEY` as a Cloudflare secret if you want a server-side default

Note: the user's Gemini API key is stored in browser localStorage (set via the
Settings tab), so a server-side default is optional.

### Step 7: Verify

Visit your Cloudflare Pages URL, open the Settings tab, paste a Gemini API key,
and test:

- ✅ Discover tab: should work if you deployed with the ZAI workaround (Option A or B)
- ⚠️ Discover tab: will fail if you chose Option C (no ZAI) — see constraints above
- ✅ Pipeline tab: works on D1
- ✅ Lead detail sheet: works on D1
- ✅ Messages tab: works (direct Gemini call, no ZAI needed when on Cloudflare's edge)

## Alternative: Skip Cloudflare, Deploy to a Node.js Host

If you want all features working without the ZAI SDK constraint, deploy to:

- **Railway**: `railway up` — supports Node.js + persistent volumes
- **Fly.io**: `fly launch` — supports Node.js + persistent volumes
- **Render**: GitHub integration, supports persistent disks

No code changes needed — the local SQLite + Prisma setup works as-is.

## Troubleshooting

- **"User location is not supported for the API use"** — Gemini is geo-blocked
  from your edge PoP. The app's ZAI fallback should kick in automatically if
  available. On Cloudflare without ZAI configured, you'll see this error in
  server logs.
- **Prisma D1 errors** — make sure `wrangler d1 migrations apply` was run
  against the production database.
- **Next.js build errors with `next-on-pages`** — try downgrading to
  `next@15.x` if Next.js 16 compatibility issues arise.
