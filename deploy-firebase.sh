#!/usr/bin/env bash
set -e

# Change directory to script folder
cd "$(dirname "$0")"

echo "============================================="
echo "  NEXUS Multi-Site Firebase Deployment"
echo "============================================="

# Step 1: Pre-flight check - verify NO EM DASHES exist in any site
echo "🔍 Checking for forbidden em dashes (—)..."
EM_DASHES=$(grep -rn "—" sites/ *.html 2>/dev/null || true)
if [ -n "$EM_DASHES" ]; then
  echo "❌ DEPLOYMENT BLOCKED: Em dashes (—) found in the following files:"
  echo "$EM_DASHES"
  echo "Please remove all em dashes before deploying."
  exit 1
fi
echo "✓ Zero em dashes found."

# Step 2: Synchronize shared assets (favicon, stats, npm-live)
echo "📦 Synchronizing shared assets across sub-sites..."
node scripts/sync-sites.mjs

TARGET="${1:-all}"

if [ "$TARGET" = "all" ]; then
  echo "🚀 Deploying all 5 hosting sites to Firebase..."
  npx -y firebase-tools deploy --only hosting
else
  echo "🚀 Deploying target [$TARGET] to Firebase..."
  npx -y firebase-tools deploy --only hosting:"$TARGET"
fi

echo "✅ Deployment finished."

