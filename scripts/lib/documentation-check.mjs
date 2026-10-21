import path from 'node:path';

export const ENGINE_GUIDES = Object.freeze([
  'AI_GAME_DEVELOPER.md', 'CODING_RULEBOOK.md', 'ENGINE_ARCHITECTURE.md',
  'GAMEPLAY_RUNTIME.md', 'CHARACTER_SYSTEM.md', 'PHYSICS_ENGINE.md', 'OPERATIONS.md', 'STATUS.md',
]);

export function markdownAnchors(text) {
  const anchors = new Set(), counts = new Map();
  let fenced = false;
  for (const line of text.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; continue; }
    if (fenced) continue;
    const heading = line.match(/^#{1,6}\s+(.+?)(?:\s+#+)?$/);
    if (!heading) continue;
    const slug = heading[1].toLowerCase().replace(/<[^>]*>/g, '').replace(/[^\p{L}\p{N}_\-\s]/gu, '').replace(/ /g, '-');
    const count = counts.get(slug) ?? 0;
    anchors.add(count ? `${slug}-${count}` : slug); counts.set(slug, count + 1);
  }
  for (const match of text.matchAll(/<(?:a|h[1-6])\s+[^>]*(?:id|name)=["']([^"']+)["']/g)) anchors.add(match[1]);
  return anchors;
}

/** Resolve local Markdown links without network access or assumptions about the cwd. */
export function documentationLinkFailures(filename, text, exists, read) {
  const failures = [];
  for (const match of text.matchAll(/\[[^\]]*\]\((<[^>]+>|[^\s)]+)(?:\s+"[^"]*")?\)/g)) {
    const href = match[1].replace(/^<|>$/g, '');
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href)) continue;
    const [file, rawFragment] = href.split('#');
    let target, fragment;
    try { target = file ? path.resolve(path.dirname(filename), decodeURIComponent(file)) : filename; fragment = decodeURIComponent(rawFragment ?? ''); }
    catch { failures.push(`Malformed link: ${href}`); continue; }
    if (!exists(target)) { failures.push(`Missing target: ${href}`); continue; }
    if (fragment && target.endsWith('.md') && !markdownAnchors(read(target)).has(fragment)) failures.push(`Missing heading: ${href}`);
  }
  return failures;
}
