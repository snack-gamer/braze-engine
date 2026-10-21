import assert from 'node:assert/strict';
import { test } from 'node:test';
import { documentationLinkFailures, markdownAnchors } from './documentation-check.mjs';

test('resolves local targets, encoded paths and duplicate heading anchors without treating examples as headings', () => {
  const files = new Map([
    ['/repo/README.md', '# Entry\n[guide](docs/Guide%20One.md#repeat-1) [web](https://example.com/missing)'],
    ['/repo/docs/Guide One.md', '# Repeat\n## Repeat\n```md\n# Fake\n```'],
  ]);
  assert.deepEqual(documentationLinkFailures('/repo/README.md', files.get('/repo/README.md'), (p) => files.has(p), (p) => files.get(p)), []);
  assert.deepEqual([...markdownAnchors(files.get('/repo/docs/Guide One.md'))], ['repeat', 'repeat-1']);
});
test('rejects deleted manuals and stale anchors instead of accepting links to a renamed guide', () => {
  const exists = (p) => p === '/repo/New.md';
  const failures = documentationLinkFailures('/repo/README.md', '[old](Old.md) [heading](New.md#removed) [bad](bad%XZ.md)', exists, () => '# New');
  assert.deepEqual(failures, ['Missing target: Old.md', 'Missing heading: New.md#removed', 'Malformed link: bad%XZ.md']);
});
