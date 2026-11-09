import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const sharedFiles = ['favicon.svg', 'stats.json', 'npm-live.js', 'llms.txt'];
const subSites = ['agent', 'mcp', 'harness', 'tests'];

console.log('🔄 Syncing shared branding assets to sub-sites...');

for (const site of subSites) {
  const targetDir = path.join(rootDir, 'sites', site);
  if (!fs.existsSync(targetDir)) {
    console.warn(`⚠️ Target dir ${targetDir} does not exist, skipping.`);
    continue;
  }

  for (const file of sharedFiles) {
    const src = path.join(rootDir, file);
    const dest = path.join(targetDir, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      console.log(`  ✓ Copied ${file} -> sites/${site}/${file}`);
    } else {
      console.warn(`  ⚠️ Source file not found: ${src}`);
    }
  }
}

console.log('✨ All sub-sites assets successfully synchronized.');

