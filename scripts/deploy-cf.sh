#!/bin/bash
# Deploy to Cloudflare Pages with edge runtime (workaround for the
# next-on-pages requirement that all routes use runtime = "edge").
#
# This script temporarily swaps `runtime = "nodejs"` to `runtime = "edge"`
# in all route files, builds with @cloudflare/next-on-pages, deploys with
# wrangler, then reverts the source files to nodejs runtime for local dev.
#
# Why: standard PrismaClient works on nodejs runtime locally (with SQLite
# file) but doesn't work on edge runtime. The D1 adapter (used in lib/db.ts)
# works on edge runtime via getOptionalRequestContext(). So we need edge
# runtime for Cloudflare build, but nodejs for local dev.
#
# Usage: bash scripts/deploy-cf.sh
set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

echo "=========================================="
echo " LeadForge Cloudflare deploy"
echo "=========================================="

# Step 1: swap runtime = "nodejs" → runtime = "edge" in all route files
echo "[1/4] Swapping runtime = 'nodejs' → 'edge' in route files..."
find src/app/api -name "route.ts" -exec sed -i 's|export const runtime = "nodejs";|export const runtime = "edge";|g' {} \;
echo "  ✓ Done. (Source files modified temporarily.)"

# Trap to ensure we revert even on failure
trap '
  echo ""
  echo "[cleanup] Reverting runtime back to 'nodejs' for local dev..."
  find src/app/api -name "route.ts" -exec sed -i '\''s|export const runtime = "edge";|export const runtime = "nodejs";|g'\'' {} \;
  echo "  ✓ Reverted."
' EXIT

# Step 2: build
echo ""
echo "[2/4] Building with @cloudflare/next-on-pages..."
rm -rf .vercel
bunx @cloudflare/next-on-pages 2>&1 | tail -5
if [ ! -f .vercel/output/static/_worker.js/index.js ]; then
  echo "  ✗ Build failed — _worker.js not generated."
  exit 1
fi
echo "  ✓ Build succeeded."

# Step 3: deploy
echo ""
echo "[3/4] Deploying to Cloudflare Pages..."
wrangler pages deploy .vercel/output/static --project-name=leadforge 2>&1 | tail -5
echo "  ✓ Deployed."

# Step 4: revert (handled by trap)
echo ""
echo "[4/4] Reverting source files to 'nodejs' runtime for local dev..."
# (trap will do this)

echo ""
echo "=========================================="
echo " ✓ Deploy complete"
echo "   Production URL: https://leadforge-e1v.pages.dev/"
echo "=========================================="
