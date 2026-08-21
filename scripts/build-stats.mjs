#!/usr/bin/env node
/**
 * build-stats.mjs — regenerate stats.json from the real CLI package.
 *
 * The homepage used to hardcode "17 tools / 546 tests / 18 commands" into six
 * separate files, which is why they drifted apart between releases. These
 * numbers are release-coupled: they change when the CLI changes, not on their
 * own, so they cannot come from a public API. Instead they come from ONE
 * generated file that every page fetches at runtime.
 *
 *   node scripts/build-stats.mjs                 # counts + full test run
 *   node scripts/build-stats.mjs --no-tests      # keep the recorded test count
 *   node scripts/build-stats.mjs --cli ../path   # CLI checkout somewhere else
 *
 * Truly live numbers (npm downloads, published version) are NOT in here.
 * Those are fetched client-side from npm in npm-live.js.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(HERE, '..');
const OUT = join(SITE, 'stats.json');

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name, fallback) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const CLI = resolve(SITE, value('--cli', '../../nexus-cli'));
const SKILLS = resolve(SITE, value('--skills', '../../nexus-skills'));

if (!existsSync(join(CLI, 'package.json'))) {
  console.error(`✖ No CLI package found at ${CLI}`);
  console.error('  Pass the checkout explicitly: --cli ../../nexus-cli');
  process.exit(1);
}

const read = (p) => readFileSync(join(CLI, p), 'utf8');
const pkg = JSON.parse(read('package.json'));

/* ── commands: the top-level command list, straight from --help ───────────── */
// Do NOT regex `.command()` out of src/cli.ts: that also matches the
// subcommands registered on `skill`, `agent`, and `plan` (list/new/status/…)
// and inflates 18 into 22. --help prints only the top level, one command per
// line at exactly two spaces of indent; wrapped descriptions indent far deeper.
const help = execFileSync('node', [join(CLI, 'bin/nexus.js'), '--help'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});
const commands = [...help.slice(help.indexOf('Commands:')).matchAll(/^ {2}([a-z][a-z-]*)[ [<]/gm)]
  .map((m) => m[1])
  .filter((c) => c !== 'help');

if (commands.length === 0) {
  console.error('✖ Parsed zero commands from --help. Has the output format changed?');
  process.exit(1);
}

/* ── MCP tools: nexus_* names exposed by the server ───────────────────────── */
const mcpDir = join(CLI, 'src/mcp');
const mcpSrc = readdirSync(mcpDir)
  .filter((f) => f.endsWith('.ts'))
  .map((f) => readFileSync(join(mcpDir, f), 'utf8'))
  .join('\n');
const tools = [...new Set([...mcpSrc.matchAll(/['"`](nexus_[a-z_]+)['"`]/g)].map((m) => m[1]))];

/* ── doctor checks: one D-numbered module per check ───────────────────────── */
const checks = readdirSync(join(CLI, 'src/utils/doctor/checks'))
  .map((f) => f.match(/^(D\d+)\.ts$/)?.[1])
  .filter(Boolean);

/* ── skills registry: version + shared-skill count, from the checkout ─────── */
// This was hardcoded to '0.3.0' below, which is exactly the drift this script
// exists to stop. Read it from the registry, or fall back to the recorded value.
const prevStats = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};

// The registry's package.json lives at packages/core/, not the repo root.
const SKILLS_PKG = join(SKILLS, 'packages/core');

let skillsVersion = prevStats.skillsVersion ?? null;
if (existsSync(join(SKILLS_PKG, 'package.json'))) {
  skillsVersion = JSON.parse(readFileSync(join(SKILLS_PKG, 'package.json'), 'utf8')).version ?? skillsVersion;
} else {
  // Reuse the recorded value rather than inventing one — an unpublished version
  // number on the homepage is worse than a stale one.
  console.log(`• skills: no package.json at ${SKILLS_PKG}, reusing recorded ${skillsVersion}`);
}

// Skill counts, by framework directory. These drift exactly like the CLI
// counts did, so they come from the tree rather than from prose.
let sharedSkills = prevStats.sharedSkills ?? null;
let totalSkills = prevStats.totalSkills ?? null;
let frameworks = prevStats.frameworks ?? null;
if (existsSync(SKILLS_PKG)) {
  const isSkill = (f) => f.endsWith('.md') && f.toLowerCase() !== 'readme.md';
  const dirs = readdirSync(SKILLS_PKG, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  const counts = Object.fromEntries(
    dirs.map((d) => [d, readdirSync(join(SKILLS_PKG, d)).filter(isSkill).length]),
  );

  // `agents/` holds agent definitions, not skills — excluded from both counts,
  // so stats.json agrees with what the skills page actually lists.
  const skillDirs = dirs.filter((d) => d !== 'agents');
  sharedSkills = counts.shared ?? sharedSkills;
  totalSkills = skillDirs.reduce((sum, d) => sum + counts[d], 0);
  frameworks = skillDirs.length;
  console.log(`• skills: ${JSON.stringify(counts)}`);
}

/* ── tests: the only number that needs the suite to actually run ──────────── */
let tests = null;
if (flag('--no-tests') && existsSync(OUT)) {
  tests = JSON.parse(readFileSync(OUT, 'utf8')).tests ?? null;
  console.log(`• tests: reusing recorded ${tests} (--no-tests)`);
} else {
  console.log('• tests: running the suite…');
  const out = execFileSync('npx', ['vitest', 'run', '--reporter=dot'], {
    cwd: CLI,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 32 * 1024 * 1024,
  });
  const m = out.match(/Tests\s+(\d+)\s+passed\s+\((\d+)\)/);
  if (!m || m[1] !== m[2]) {
    console.error('✖ Refusing to publish a test count from a non-green run.');
    process.exit(1);
  }
  tests = Number(m[1]);
}

const stats = {
  $comment: 'Generated by scripts/build-stats.mjs — do not hand-edit.',
  generated: new Date().toISOString().slice(0, 10),
  version: pkg.version,
  tests,
  commands: commands.length,
  tools: tools.length,
  checks: checks.length,
  skillsVersion,
  sharedSkills,
  totalSkills,
  frameworks,
};

writeFileSync(OUT, JSON.stringify(stats, null, 2) + '\n');

console.log('\n✓ stats.json');
for (const [k, v] of Object.entries(stats)) {
  if (!k.startsWith('$')) console.log(`  ${k.padEnd(14)} ${v}`);
}
console.log(`\n  commands: ${commands.sort().join(' ')}`);
console.log(`  checks:   ${checks.sort().join(' ')}`);
