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
  -x "deploy.sh" \
  -x "*.zip" \
  -x "index.html.old" -x "*-legacy.html"

echo "Contents:"
unzip -l "$ZIP_NAME" | tail -n +4 | head -n -2

# ── 2. Transfer ───────────────────────────────────────────────────────────────
echo "Transferring $ZIP_NAME to $REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH"
scp "$ZIP_NAME" "$REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH/"

# ── 3. Unzip on server ────────────────────────────────────────────────────────
echo "Deploying on remote host..."
ssh "$REMOTE_USER@$REMOTE_HOST" <<SSH_EOF
set -e
mkdir -p "$REMOTE_PATH"
cd "$REMOTE_PATH"
unzip -o $ZIP_NAME
rm -f $ZIP_NAME
# Remove anything a previous deploy may have leaked onto the docroot
rm -rf .git .nexus .vscode deploy.sh index.html.old index-v0.4-legacy.html docs-v0.3-legacy.html AGENTS.md copilot-instructions.md NEXUS_CLI_README.md .clinerules .cursorrules .windsurfrules
echo "Deployment complete!"
SSH_EOF

# ── 4. Cleanup + smoke check ──────────────────────────────────────────────────
rm -f "$ZIP_NAME"
echo "Smoke check:"
curl -s -o /dev/null -w "  / → %{http_code}\n"          https://nexus.glenhalton.com/ || true
curl -s -o /dev/null -w "  /docs → %{http_code}\n"      https://nexus.glenhalton.com/docs || true
curl -s -o /dev/null -w "  /llms.txt → %{http_code}\n"  https://nexus.glenhalton.com/llms.txt || true
curl -s -o /dev/null -w "  /.git/config → %{http_code} (want 403/404)\n" https://nexus.glenhalton.com/.git/config || true
echo "Done — https://nexus.glenhalton.com"
