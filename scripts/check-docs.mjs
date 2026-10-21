import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_GUIDES, documentationLinkFailures } from './lib/documentation-check.mjs';

const engine = fileURLToPath(new URL('..', import.meta.url));
const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: engine, encoding: 'utf8' }).trim();
const read = (file) => readFileSync(file, 'utf8');
const files = [...new Set(execFileSync('git', ['ls-files', '-co', '--exclude-standard', '--', '*.md'], { cwd: root, encoding: 'utf8' }).trim().split('\n'))]
  .filter((file) => file && !file.startsWith('vendor/') && existsSync(path.join(root, file)));
const actual = readdirSync(path.join(engine, 'docs')).filter((file) => file.endsWith('.md')).sort();
const failures = [];
if (actual.join('\n') !== [...ENGINE_GUIDES].sort().join('\n')) failures.push('Engine docs must use the eight authoritative guides; update their existing sections.');
for (const file of files) {
  for (const failure of documentationLinkFailures(path.join(root, file), read(path.join(root, file)), existsSync, read)) failures.push(`${file}: ${failure}`);
}
const skill = read(path.join(engine, 'skills/braze-game-developer/SKILL.md'));
for (const guide of ['AI_GAME_DEVELOPER.md', 'GAMEPLAY_RUNTIME.md', 'OPERATIONS.md', 'STATUS.md']) {
  if (!skill.includes(`docs/${guide}`)) failures.push(`Skill must route to canonical ${guide}.`);
}
if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
else console.log(`Documentation checked: ${actual.length} guides, ${files.length} owned Markdown files, local links and skill routing.`);
