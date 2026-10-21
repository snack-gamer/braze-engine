import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [destination, mode] = process.argv.slice(2);
if (!destination || mode && mode !== '--check') {
  console.error('Usage: node scripts/sync-agent-skill.mjs <installed-skill-directory> [--check]');
  process.exitCode = 1;
} else {
  const source = fileURLToPath(new URL('../skills/braze-game-developer', import.meta.url));
  const target = path.resolve(destination);
  if (target === source) throw new Error('Destination must be an installed copy, not the canonical repository skill.');
  let changed = false;
  for (const name of ['SKILL.md', 'agents/openai.yaml']) {
    const contents = await readFile(path.join(source, name), 'utf8');
    const existing = await readFile(path.join(target, name), 'utf8').catch((error) => { if (error.code === 'ENOENT') return null; throw error; });
    if (contents === existing) continue;
    changed = true;
    if (mode === '--check') { console.error(`Skill differs: ${name}`); continue; }
    await mkdir(path.dirname(path.join(target, name)), { recursive: true });
    await writeFile(path.join(target, name), contents);
  }
  // These three former bundled manuals now route to the repository's authoritative guides.
  for (const name of ['commands.md', 'live-editor.md', 'physics-authoring.md']) {
    const file = path.join(target, 'references', name);
    const existing = await readFile(file, 'utf8').catch((error) => { if (error.code === 'ENOENT') return null; throw error; });
    if (existing === null) continue;
    changed = true;
    if (mode === '--check') console.error(`Retired skill reference: ${name}`);
    else await rm(file);
  }
  if (mode === '--check' && changed) process.exitCode = 1;
  else console.log(mode === '--check' ? 'Installed skill matches the repository.' : 'Installed Braze skill synchronized; other resources preserved.');
}
