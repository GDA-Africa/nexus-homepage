#!/usr/bin/env node
/**
 * notify-testers.mjs — Dispatch early access updates to Nexus Testers
 * 
 * Powered by GDA Centralized Email Gateway (https://gmailer-gda.fly.dev)
 * 
 * Usage:
 *   node scripts/notify-testers.mjs --dry-run
 *   node scripts/notify-testers.mjs --subject="[Nexus Early Access] v2.1.0-rc.1 Ready for Testing" --version="2.1.0-rc.1" --tag="next"
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROSTER_PATH = resolve(__dirname, '../data/testers.json');
const GMAILER_ENDPOINT = 'https://gmailer-gda.fly.dev/send-email';

// Parse arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const getArg = (key, fallback = '') => {
  const match = args.find(a => a.startsWith(`--${key}=`));
  return match ? match.split('=')[1] : fallback;
};

const version = getArg('version', '2.0.1-rc.1');
const tag = getArg('tag', 'next');
const targetChannel = getArg('channel', 'all'); // 'all', 'rc', 'bleeding-edge'
const customSubject = getArg('subject', `[Nexus Early Access] v${version} Pre-release Ready for Testing`);
const customHighlights = getArg('highlights', 'New MCP project-graph tools, updated scaffolding templates, and execution speedups.');

if (!existsSync(ROSTER_PATH)) {
  console.log(`ℹ️  No roster file found at ${ROSTER_PATH}.`);
  console.log(`   Once testers enroll via https://nexus.glenhalton.com/testers, entries will be recorded.`);
  process.exit(0);
}

let testers = [];
try {
  testers = JSON.parse(readFileSync(ROSTER_PATH, 'utf8'));
} catch (err) {
  console.error(`❌ Failed to read roster at ${ROSTER_PATH}:`, err.message);
  process.exit(1);
}

// Filter testers by channel preference if specified
const recipients = testers.filter(t => {
  if (!t.email) return false;
  if (targetChannel === 'all') return true;
  return t.channel === targetChannel || t.channel === 'bleeding-edge';
});

console.log(`\n🧠 NEXUS TESTER DISPATCH ENGINE`);
console.log(`──────────────────────────────────────────`);
console.log(`Target Version:   v${version} (@${tag})`);
console.log(`Channel Filter:   ${targetChannel}`);
console.log(`Eligible Testers: ${recipients.length} of ${testers.length}`);
console.log(`Mode:             ${isDryRun ? 'DRY RUN (No emails sent)' : 'LIVE DISPATCH'}\n`);

if (recipients.length === 0) {
  console.log('No recipients match the given criteria.');
  process.exit(0);
}

function buildEmailHtml(tester) {
  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0a0d12; color: #e8edf2; margin: 0; padding: 24px; }
.card { max-width: 620px; margin: 0 auto; background: #0e1319; border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; padding: 32px; }
.badge { display: inline-block; font-family: monospace; font-size: 11px; padding: 4px 10px; border-radius: 20px; background: rgba(52,211,153,0.1); color: #34d399; border: 1px solid rgba(52,211,153,0.3); margin-bottom: 20px; }
h1 { font-size: 24px; font-weight: 700; color: #ffffff; margin: 0 0 16px; }
p { font-size: 15px; line-height: 1.6; color: #8a94a6; margin: 0 0 16px; }
.cmd-box { background: #06080b; border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 14px 18px; font-family: monospace; font-size: 13px; color: #6ee7b7; margin: 20px 0; }
.list { margin: 16px 0; padding-left: 20px; color: #8a94a6; font-size: 14px; line-height: 1.7; }
.footer { border-top: 1px solid rgba(255,255,255,0.08); margin-top: 32px; padding-top: 20px; font-size: 12px; color: #566070; }
</style>
</head>
<body>
<div class="card">
  <div class="badge">NEXUS EARLY ACCESS DISPATCH · v${version}</div>
  <h1>New Test Build Ready: Nexus v${version}</h1>
  <p>Hello ${tester.name || 'Tester'},</p>
  <p>A new pre-release build of the Nexus Framework has been published to npm under the <code>@${tag}</code> dist-tag for early validation.</p>
  
  <p><b>What's New in this Build:</b><br>${customHighlights}</p>

  <p><b>How to Update & Test:</b></p>
  <div class="cmd-box">npm install -g @nexus-framework/cli@${tag}</div>

  <p><b>Testing Focus Areas:</b></p>
  <ul class="list">
    <li>Run <code>nexus wake</code> in existing projects to verify handshake and drift checks.</li>
    <li>Test <code>nexus harness</code> to verify GUI loading and Cordis session stability.</li>
    <li>Verify MCP tool execution in your primary tool (${tester.agent || 'Claude Code / Cursor'}).</li>
  </ul>

  <p><b>Reporting Findings:</b><br>
  Found an issue or drift error? Share output from <code>nexus doctor --severity=warn</code> or reply directly to this email.</p>

  <div class="footer">
    Sent to ${tester.email} because you are enrolled in the Nexus Insiders program.<br>
    © 2026 NEXUS Framework by GDA Africa · <a href="https://nexus.glenhalton.com" style="color:#34d399;text-decoration:none">nexus.glenhalton.com</a>
  </div>
</div>
</body>
</html>
`;
}

async function run() {
  let sent = 0;
  let failed = 0;

  for (const tester of recipients) {
    if (isDryRun) {
      console.log(`[DRY RUN] Would send to: ${tester.name} <${tester.email}> (${tester.channel || 'rc'})`);
      sent++;
      continue;
    }

    try {
      console.log(`› Dispatching to ${tester.email}...`);
      const res = await fetch(GMAILER_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: tester.email,
          subject: customSubject,
          html_body: buildEmailHtml(tester),
          sender_name: 'Nexus Framework',
          source_url: 'https://nexus.glenhalton.com/testers',
          logo_url: 'https://nexus.glenhalton.com/favicon.svg'
        })
      });

      if (res.ok) {
        sent++;
      } else {
        console.warn(`  ⚠ Gateway returned ${res.status} for ${tester.email}`);
        failed++;
      }
    } catch (err) {
      console.error(`  ❌ Error sending to ${tester.email}:`, err.message);
      failed++;
    }
  }

  console.log(`\n──────────────────────────────────────────`);
  console.log(`Dispatched: ${sent} | Failed: ${failed}`);
}

run();
