import { chromium } from 'playwright';
import { localEngineUrl } from './engine-command-client.mjs';
import { setTimeout as delay } from 'node:timers/promises';

const keyPattern = /^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Space|Enter|Escape|Tab|Backspace|ShiftLeft|ShiftRight)$/;
const attribute = (value) => `"${String(value).replace(/["\\\n\r\f]/g, (char) => `\\${char.charCodeAt(0).toString(16)} `)}"`;
export function validateBrowserSteps(steps) {
  if (!Array.isArray(steps) || !steps.length || steps.length > 32) throw new Error('Browser input requires 1–32 steps.');
  let duration = 0;
  for (const step of steps) {
    if (!step || typeof step !== 'object') throw new Error('Invalid browser step.');
    if (step.kind === 'key') {
      if (!keyPattern.test(step.key) || !Number.isInteger(step.durationMs ?? 0) || (step.durationMs ?? 0) < 0 || (step.durationMs ?? 0) > 2000) throw new Error('Key steps need a supported physical code and durationMs 0–2000.');
      duration += step.durationMs ?? 0;
    } else if (step.kind === 'wait') {
      if (!Number.isInteger(step.durationMs) || step.durationMs < 0 || step.durationMs > 1000) throw new Error('Wait steps require durationMs 0–1000.');
      duration += step.durationMs;
    } else if (step.kind === 'pointer') {
      if (![step.x, step.y].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)
        || !['move', 'click'].includes(step.action)) throw new Error('Pointer steps need move/click and normalized x/y in [0,1].');
    } else if (step.kind === 'ui') {
      if (typeof step.screenId !== 'string' || !step.screenId || step.screenId.length > 256 || typeof step.nodeId !== 'string' || !step.nodeId || step.nodeId.length > 64
        || !['click', 'fill', 'check', 'uncheck', 'focus'].includes(step.action)
        || step.action === 'fill' && (typeof step.value !== 'string' || step.value.length > 4096)) throw new Error('UI steps require screenId, nodeId and click/fill/check/uncheck/focus (fill requires a string value).');
    } else if (step.kind !== 'focus') throw new Error(`Unknown browser input step ${step.kind}.`);
  }
  if (duration > 5000) throw new Error('Browser input has a maximum 5-second declared duration.');
  return steps;
}

/** Public CLI/server/MCP browser actions share one bounded, session-targeted owner.
 * Connects only to an existing dedicated browser; never creates tabs or closes them. */
export async function executeBrowserCommand(request, { engineUrl, port = Number(process.env.BRAZE_BROWSER_PORT || 9339), signal } = {}) {
  signal = signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000);
  const origin = localEngineUrl(engineUrl).origin;
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid BRAZE_BROWSER_PORT.');
  const steps = request.operation === 'browser.input' ? validateBrowserSteps(request.steps) : null;
  if (!['browser.inspect', 'browser.capture', 'browser.input'].includes(request.operation)) throw new Error('Unknown browser command.');
  if (request.operation !== 'browser.inspect' && (typeof request.sessionId !== 'string' || !request.sessionId)) throw new Error('Choose an explicit editor sessionId from browser.inspect.');
  if (request.area !== undefined && !['game', 'editor'].includes(request.area)) throw new Error('Capture area must be game or editor.');
  signal?.throwIfAborted();
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 5000, noDefaults: true }).catch(() => {
    throw new Error(`No dedicated browser on port ${port}. Run engine-browser.mjs open for this engine, or set BRAZE_BROWSER_PORT for an owned automated browser.`);
  });
  try {
    const candidates = [];
    for (const page of browser.contexts().flatMap((context) => context.pages())) {
      if (!page.url().startsWith(origin + '/')) continue;
      const sessionId = await page.locator('html').getAttribute('data-braze-editor-session', { timeout: 2000 });
      if (sessionId) candidates.push({ page, sessionId });
    }
    if (request.operation === 'browser.inspect') return { sessions: await Promise.all(candidates.map(async ({ page, sessionId }) => ({ sessionId, title: await page.title(), url: page.url() }))), controlPort: port };
    const matching = candidates.filter((entry) => entry.sessionId === request.sessionId);
    if (matching.length !== 1) throw new Error('Requested editor session is not uniquely present in the dedicated browser. Inspect browser sessions first.');
    const { page } = matching[0];
    const surface = page.locator('[data-runtime-input-surface="true"]');
    if (request.operation === 'browser.capture') {
      const target = request.area === 'editor' ? page.locator('body') : surface;
      if (await target.count() !== 1) throw new Error('Open one visible Game view before capturing it.');
      const box = await target.boundingBox();
      if (!box || box.width > 4096 || box.height > 4096) throw new Error('Capture requires a visible area no larger than 4096×4096 CSS pixels.');
      signal?.throwIfAborted();
      const png = await target.screenshot({ type: 'png', scale: 'css', timeout: 5000 });
      if (png.length > 8 * 1024 * 1024) throw new Error('Capture exceeds 8 MiB; use a smaller Game view.');
      return { sessionId: request.sessionId, area: request.area ?? 'game', width: box.width, height: box.height, image: { mimeType: 'image/png', data: png.toString('base64') } };
    }
    if (await surface.count() !== 1 || !await surface.isVisible()) throw new Error('Open one visible Game view before sending input.');
    if (await page.locator('html').getAttribute('data-braze-editor-session') !== request.sessionId) throw new Error('Editor session retired.');
    await page.bringToFront();
    let completedSteps = 0;
    try {
      for (const step of steps) {
        signal.throwIfAborted();
        if (await page.locator("html").getAttribute("data-braze-editor-session", { timeout: 500 }) !== request.sessionId) throw new Error("Editor session retired during input.");
        if (step.kind === 'focus') await surface.focus({ timeout: 1000 });
        else if (step.kind === 'wait') await delay(step.durationMs, undefined, { signal });
        else if (step.kind === 'key') {
          // No editor/global keyboard focus: refuse input until Game or its UI owns focus.
          if (!await surface.evaluate((element) => element.contains(element.ownerDocument.activeElement))) throw new Error('Focus Game or a UI control before key input.');
          try { await page.keyboard.down(step.key); await delay(step.durationMs ?? 0, undefined, { signal }); }
          finally { await page.keyboard.up(step.key); }
        } else if (step.kind === 'pointer') {
          const box = await surface.boundingBox(); if (!box) throw new Error('Game view became hidden.');
          const x = box.x + Math.min(box.width - 1, step.x * box.width), y = box.y + Math.min(box.height - 1, step.y * box.height);
          if (step.action === 'move') await page.mouse.move(x, y); else await page.mouse.click(x, y);
        } else {
          const node = surface.locator(`[data-ui-screen=${attribute(step.screenId)}] [data-ui-node=${attribute(step.nodeId)}]`);
          if (await node.count() !== 1) throw new Error('UI target is missing or ambiguous. Inspect editor.ui first.');
          if (step.action === 'fill') await node.locator('input[type=text]').fill(step.value, { timeout: 1000 });
          else if (step.action === 'check' || step.action === 'uncheck') await node.locator('input[type=checkbox]').setChecked(step.action === 'check', { timeout: 1000 });
          else if (step.action === 'focus') await (await node.locator('input').count() ? node.locator('input') : node).focus({ timeout: 1000 });
          else await node.click({ timeout: 1000 });
        }
        completedSteps++;
      }
      return { sessionId: request.sessionId, completedSteps, replayed: false };
    } catch (error) { throw new Error(`Browser input stopped after ${completedSteps}/${steps.length} steps. No replay. Inspect before retrying. ${error.message}`); }
  } finally { await browser.close(); } // CDP disconnect; existing browser and tabs remain owned by their launcher.
}
