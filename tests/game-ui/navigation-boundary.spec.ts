import { test, expect } from 'playwright/test';

test('controller skips hidden screens and ancestors, edits ranges and holds gameplay until neutral', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    // Integration test of the real DOM adapter; platform samples are explicitly simulated.
    const { createUiSession } = await import('/src/game-ui/runtime/ui-session.ts');
    const { attachBrowserUiSurface } = await import('/src/game-ui/adapters/browser-ui-surface.ts');
    const { createUiCanvas } = await import('/src/game-ui/domain/ui-document.ts');
    const session = createUiSession(), base = createUiCanvas();
    const screen = session.port.create('lower', { ...base, navigation: { enabled: true }, root: { ...base.root, children: [
      { id: 'hidden', kind: 'panel', visible: false, children: [{ id: 'skip', kind: 'button', text: 'Hidden' }] },
      { id: 'disabled', kind: 'button', text: 'Disabled', disabled: true },
      { id: 'range', kind: 'slider', value: 0, min: 0, max: 10, step: 2, action: 'adjust' },
      { id: 'toggle', kind: 'toggle', value: false, action: 'check' },
    ] } });
    session.port.create('upper', { ...base, order: 10, navigation: { enabled: true }, root: { ...base.root, visible: false, children: [{ id: 'covered', kind: 'button', text: 'Not shown' }] } });
    session.setEnabled(true);
    const surface = document.createElement('div'); surface.tabIndex = 0; surface.style.cssText = 'position:fixed;inset:0;width:400px;height:400px'; document.body.append(surface);
    const detach = attachBrowserUiSurface(session, surface), original = Object.getOwnPropertyDescriptor(navigator, 'getGamepads');
    const buttons = Array.from({ length: 17 }, () => ({ value: 0 }));
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [{ mapping: 'standard', connected: true, axes: [0, 0], buttons }] });
    const advance = () => { const consumed = detach.advance(1 / 60); session.advance(1 / 60); return consumed; };
    const press = (index: number) => { buttons[index].value = 1; const consumed = advance(); buttons[index].value = 0; advance(); return consumed; };
    try {
      surface.focus(); advance(); press(13); const first = detach.inspect().focused;
      press(15); const range = screen.inspect('range').value;
      press(13); press(0); const checked = screen.inspect('toggle').value;
      buttons[1].value = 1; const cancel = advance(), stillHeld = advance(); buttons[1].value = 0; const released = advance();
      return { first, range, checked, cancel, stillHeld, released, focused: detach.inspect().focused };
    } finally { if (original) Object.defineProperty(navigator, 'getGamepads', original); else delete (navigator as Partial<Navigator>).getGamepads; detach(); session.dispose(); surface.remove(); }
  });
  expect(result).toEqual({ first: 'range', range: 2, checked: true, cancel: true, stillHeld: true, released: false, focused: null });
});
