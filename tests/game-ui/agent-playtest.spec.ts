import { test, expect } from 'playwright/test';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { fileURLToPath } from 'node:url';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

test('MCP observes pixels, sends bounded native input and exports a saved playable scene', async ({ page }, info) => {
  const client = new Client({ name: 'ui-native-acceptance', version: '1' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('../../scripts/engine-mcp.mjs', import.meta.url))], env: { BRAZE_ENGINE_URL: 'http://127.0.0.1:4373' } }));
  let output: string | undefined;
  const call = async (operation: string, args = {}) => {
    const result = await client.callTool({ name: `braze_${operation.replaceAll('.', '_')}`, arguments: args });
    expect(result.isError, JSON.stringify(result)).not.toBe(true); return result;
  };
  try {
    await page.goto('/'); await expect.poll(() => page.locator('html').getAttribute('data-braze-editor-session')).toBeTruthy();
    const sessionId = await page.locator('html').getAttribute('data-braze-editor-session');
    await expect.poll(async () => ((await call('editor.status', { sessionId })).structuredContent?.result as { loaded: boolean }).loaded).toBe(true);
    const sessions = ((await call('browser.inspect')).structuredContent?.result as { sessions: { sessionId: string }[] }).sessions;
    expect(sessions.some((session) => session.sessionId === sessionId)).toBe(true);
    await page.getByRole('tab', { name: 'Game', exact: true }).click();
    await call('editor.transport', { sessionId, action: 'play' });
    const ui = page.locator('[data-runtime-input-surface] [data-braze-ui]');
    await expect(ui.getByRole('button', { name: 'How to play' })).toBeVisible();
    await call('browser.input', { sessionId, steps: [{ kind: 'ui', screenId: 'hud', nodeId: 'help', action: 'click' }] });
    await expect(ui.getByText('Your next discovery', { exact: true })).toBeVisible();
    const capture = await call('browser.capture', { sessionId });
    const image = capture.content.find((item) => item.type === 'image'); expect(image?.type).toBe('image');
    if (image?.type === 'image') { const bytes = Buffer.from(image.data, 'base64'); expect(bytes.subarray(1, 4).toString()).toBe('PNG'); await writeFile(info.outputPath('agent-game-capture.png'), bytes); }
    expect(JSON.stringify(capture.structuredContent)).not.toContain('base64'); expect(page.isClosed()).toBe(false);
    await call('browser.input', { sessionId, steps: [{ kind: 'ui', screenId: 'hud', nodeId: 'close', action: 'click' }, { kind: 'wait', durationMs: 100 }, { kind: 'focus' }, { kind: 'key', key: 'KeyE', durationMs: 50 }] });
    await expect(ui.getByText('1 points', { exact: true })).toBeVisible();
    const stale = await client.callTool({ name: 'braze_browser_input', arguments: { sessionId: 'retired-session', steps: [{ kind: 'focus' }] } }); expect(stale.isError).toBe(true);
    await call('editor.transport', { sessionId, action: 'stop' });
    const saved = (await call('scene.inspect')).structuredContent?.result as { revision: string };
    const started = (await call('project.export.start', { baseRevision: saved.revision })).structuredContent?.result as { jobId: string };
    let exported: { status: string; outputDirectory?: string; log: string };
    await expect.poll(async () => { exported = (await call('project.export.status', { jobId: started.jobId })).structuredContent?.result as typeof exported; return exported.status; }, { timeout: 90000 }).not.toBe('running');
    expect(exported!.status, exported!.log).toBe('succeeded'); output = exported!.outputDirectory;
    expect(await readFile(path.join(output!, 'player.html'), 'utf8')).toContain('<html');
    await writeFile(info.outputPath('agent-export-receipt.json'), JSON.stringify(exported!, null, 2));
    const pending = (await call('project.export.start', { baseRevision: saved.revision })).structuredContent?.result as { jobId: string };
    const cancelled = (await call('project.export.cancel', { jobId: pending.jobId })).structuredContent?.result as { status: string; outputDirectory: string | null };
    expect(cancelled.status).toBe('cancelled'); expect(cancelled.outputDirectory).toBeNull();
  } finally { await client.close(); if (output) await rm(path.dirname(output), { recursive: true, force: true }); }
});
