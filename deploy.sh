#!/bin/bash
# Deploy the NEXUS homepage to shared hosting (cPanel).
# Only public assets ship — repo internals, agent config, and legacy
# backups are excluded here AND blocked by .htaccess (defense in depth).
set -euo pipefail

REMOTE_USER="glenhalton"
REMOTE_HOST="${DEPLOY_HOST:-91.204.209.19}"
REMOTE_PATH="/home/glenhalton/nexus.glenhalton.com"
ZIP_NAME="nexus.zip"

# ── 1. Zip (allowlist mindset: exclude everything non-public) ────────────────
echo "Zipping nexus homepage into $ZIP_NAME..."
rm -f "$ZIP_NAME"
zip -r "$ZIP_NAME" . \
  -x "*.DS_Store*" \
  -x ".git/*" -x ".git*" \
  -x ".nexus/*" \
  -x ".vscode/*" \
  -x ".clinerules" -x ".cursorrules" -x ".windsurfrules" \
  -x "AGENTS.md" -x "copilot-instructions.md" -x "NEXUS_CLI_README.md" \
  -x "CLAUDE.md" -x ".claude/*" -x ".mcp.json" \
  -x "deploy.sh" \
  -x "scripts/*" \
  -x "*.zip" \
  -x "index.html.old" -x "*-legacy.html"
# NOTE: scripts/ is build tooling (build-stats.mjs), not a public asset — it
# generates stats.json locally and must never land on the docroot. The file it
# produces, stats.json, DOES ship: npm-live.js fetches it at runtime.

echo "Contents:"
zipinfo -1 "$ZIP_NAME"

# ── 2. Transfer ───────────────────────────────────────────────────────────────
echo "Transferring $ZIP_NAME to $REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH"
scp "$ZIP_NAME" "$REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH/"

# ── 3. Unzip on server ────────────────────────────────────────────────────────
echo "Deploying on remote host..."
ssh "$REMOTE_USER@$REMOTE_HOST" <<SSH_EOF
set -e
mkdir -p "$REMOTE_PATH"
cd "$REMOTE_PATH"
# Self-heal: a DIRECTORY occupying a page filename blocks unzip -o from
# replacing it (unzip warns and skips, the page 404s forever). Nuke any
# directory that collides with a file we ship.
for f in index.html docs.html mcp.html agents.html skills.html 404.html .htaccess robots.txt sitemap.xml llms.txt llms-full.txt favicon.svg npm-live.js stats.json; do
  if [ -d "\$f" ]; then echo "⚠ \$f was a DIRECTORY - removing"; rm -rf "\$f"; fi
done
unzip -o $ZIP_NAME
rm -f $ZIP_NAME
# Remove anything a previous deploy may have leaked onto the docroot
rm -rf .git .nexus .vscode .claude .mcp.json CLAUDE.md scripts deploy.sh index.html.old index-v0.4-legacy.html docs-v0.3-legacy.html AGENTS.md copilot-instructions.md NEXUS_CLI_README.md .clinerules .cursorrules .windsurfrules
# Normalize permissions: the zip preserves local file modes, and a 600
# file is unreadable by the web server process → 403 (the index.html
# incident, 2026-06-11). Web-served files must be 644, dirs 755.
find . -type f -not -name "*.sh" -exec chmod 644 {} +
find . -type d -exec chmod 755 {} +
# Verify the critical files actually landed as regular, readable files.
# npm-live.js + stats.json are included: if either is missing the pages still
# render, but every number silently freezes at its hardcoded fallback, which
# is exactly the drift this setup exists to prevent.
for f in index.html docs.html mcp.html agents.html skills.html .htaccess npm-live.js stats.json; do
  [ -f "\$f" ] || { echo "FATAL: \$f missing after deploy"; exit 1; }
done
echo "Permissions normalized (644/755)."
echo "Deployment complete!"
SSH_EOF

# ── 4. Cleanup + smoke check ──────────────────────────────────────────────────
rm -f "$ZIP_NAME"
echo "Smoke check:"
curl -s -o /dev/null -w "  / → %{http_code}\n"          https://nexus.glenhalton.com/ || true
curl -s -o /dev/null -w "  /index.html → %{http_code}\n" https://nexus.glenhalton.com/index.html || true
curl -s -o /dev/null -w "  /docs → %{http_code}\n"      https://nexus.glenhalton.com/docs || true
curl -s -o /dev/null -w "  /mcp → %{http_code}\n"       https://nexus.glenhalton.com/mcp || true
curl -s -o /dev/null -w "  /agents → %{http_code}\n"    https://nexus.glenhalton.com/agents || true
curl -s -o /dev/null -w "  /llms.txt → %{http_code}\n"  https://nexus.glenhalton.com/llms.txt || true
curl -s -o /dev/null -w "  /npm-live.js → %{http_code}\n" https://nexus.glenhalton.com/npm-live.js || true
curl -s -o /dev/null -w "  /stats.json → %{http_code}\n"  https://nexus.glenhalton.com/stats.json || true
curl -s -o /dev/null -w "  /.git/config → %{http_code} (want 403/404)\n" https://nexus.glenhalton.com/.git/config || true
curl -s -o /dev/null -w "  /scripts/build-stats.mjs → %{http_code} (want 403/404)\n" https://nexus.glenhalton.com/scripts/build-stats.mjs || true
echo "  live counts on the deployed site:"
curl -s https://nexus.glenhalton.com/stats.json | tr -d '\n ' || true
echo
echo "Done — https://nexus.glenhalton.com"
