import {
  MinMaxGradient, sampleGradient,
  type AlphaStop, type ColorRGBA, type ColorStop, type GradientData,
} from '@particles/core';
import {
  el, makeColorSwatch, makeDropdown, makeSlider,
} from './widgets';

export interface GradientEditorOptions {
  width?: number;
  height?: number;
  onChange: () => void;
}

interface SelectedStop {
  kind: 'color' | 'alpha';
  index: number;
}

/**
 * Unity-style gradient editor:
 *  - Click on a strip area to add a new color stop (shift+click for alpha).
 *  - Click an existing stop to select it; selection highlights the stop and
 *    populates the inline editor panel below the strip.
 *  - Drag a stop horizontally to reposition.
 *  - Right-click a stop to delete (endpoints are pinned).
 *  - Edit panel shows: color swatch / alpha slider + a location (0..100%)
 *    number field. All edits commit live to the curve.
 */
export class GradientEditor {
  readonly root: HTMLDivElement;
  private grad: MinMaxGradient;
  private opts: Required<GradientEditorOptions>;

  constructor(grad: MinMaxGradient, opts: GradientEditorOptions) {
    this.grad = grad;
    this.opts = { width: 200, height: 24, ...opts };
    this.root = el('div');
    this.root.style.cssText = 'display:flex;flex-direction:column;gap:3px;min-width:0;';
    this.render();
  }

  destroy(): void { this.root.remove(); }

  private render(): void {
    this.root.innerHTML = '';

    // Mode picker on its own row at top — was previously overlapping with the
    // color stops row when laid out inline with the strip.
    const modeRow = el('div', 'pi-grad-mode-row');
    const modeLbl = el('div', 'pi-grad-mode-label');
    modeLbl.textContent = 'Mode';
    const modeSel = makeDropdown(
      this.grad.data.mode,
      MODE_OPTIONS,
      (m) => { this.grad.data.mode = m; this.render(); this.opts.onChange(); },
    );
    modeRow.append(modeLbl, modeSel);
    this.root.appendChild(modeRow);

    const body = el('div', 'pi-grad-body');
    this.root.appendChild(body);

    switch (this.grad.data.mode) {
      case 'color':
        body.appendChild(makeEditRow('Color', makeColorSwatch(
          () => this.grad.data.color,
          (c) => { this.grad.data.color = c; this.opts.onChange(); },
        )));
        break;
      case 'twoColors':
        body.appendChild(makeEditRow('Min', makeColorSwatch(
          () => this.grad.data.color,
          (c) => { this.grad.data.color = c; this.opts.onChange(); },
        )));
        body.appendChild(makeEditRow('Max', makeColorSwatch(
          () => this.grad.data.colorMax,
          (c) => { this.grad.data.colorMax = c; this.opts.onChange(); },
        )));
        break;
      case 'gradient':
        body.appendChild(this.makeStrip(this.grad.data.gradient));
        break;
      case 'twoGradients':
        body.appendChild(this.makeStrip(this.grad.data.gradient, 'Min'));
        body.appendChild(this.makeStrip(this.grad.data.gradientMax, 'Max'));
        break;
    }
  }

  private makeStrip(g: GradientData, label?: string): HTMLElement {
    const outer = el('div', 'pi-grad-strip-outer');

    if (label) {
      const lbl = el('div', 'pi-grad-strip-label');
      lbl.textContent = label;
      outer.appendChild(lbl);
    }

    const wrap = el('div', 'pi-strip-wrap pi-grad-strip-wrap');
    const canvas = document.createElement('canvas');
    canvas.className = 'pi-canvas';
    canvas.width = this.opts.width * 2;
    canvas.height = this.opts.height * 2;
    canvas.style.width = '100%';
    canvas.style.height = `${this.opts.height}px`;
    canvas.style.cursor = 'crosshair';

    // The strip itself is the click target — top half = add alpha stop,
    // bottom half = add color stop. Handles still float in the rows above/
    // below where they can poke out of the strip without overlapping it.
    const colorRow = el('div', 'pi-strip-row pi-strip-row-color');
    const alphaRow = el('div', 'pi-strip-row pi-strip-row-alpha');
    colorRow.style.cssText = 'position:absolute;left:0;right:0;bottom:-14px;height:14px;';
    alphaRow.style.cssText = 'position:absolute;left:0;right:0;top:-14px;height:14px;';

    // Visible affordances inside the strip itself: corner labels + dashed
    // horizontal divider showing which half adds alpha vs colour.
    const alphaLabel = el('div', 'pi-strip-zone-label is-alpha');
    alphaLabel.textContent = 'ALPHA';
    const colorLabel = el('div', 'pi-strip-zone-label is-color');
    colorLabel.textContent = 'COLOR';
    const divider = el('div', 'pi-strip-divider');

    wrap.append(canvas, divider, alphaLabel, colorLabel, colorRow, alphaRow);

    const editor = el('div', 'pi-grad-stop-editor');

    let selected: SelectedStop | null = null;

    const isSelected = (kind: 'color' | 'alpha', index: number): boolean =>
      selected !== null && selected.kind === kind && selected.index === index;

    const redraw = (): void => { drawGradient(canvas, g); };

    const refreshHandles = (): void => {
      colorRow.innerHTML = '';
      alphaRow.innerHTML = '';
      g.colorStops.forEach((_, i) => colorRow.appendChild(
        this.makeColorHandle(g, i, isSelected('color', i), {
          onSelect: () => select({ kind: 'color', index: i }),
          onDelete: () => deleteStop('color', i),
          onDrag: (t) => moveStop('color', i, t),
        }),
      ));
      g.alphaStops.forEach((_, i) => alphaRow.appendChild(
        this.makeAlphaHandle(g, i, isSelected('alpha', i), {
          onSelect: () => select({ kind: 'alpha', index: i }),
          onDelete: () => deleteStop('alpha', i),
          onDrag: (t) => moveStop('alpha', i, t),
        }),
      ));
    };

    const renderEditor = (): void => {
      editor.innerHTML = '';
      editor.classList.toggle('is-empty', selected === null);
      if (!selected) {
        const hint = el('div', 'pi-grad-edit-hint');
        hint.textContent = 'Click strip top to add alpha · click strip bottom to add color · drag to move · right-click to delete';
        editor.appendChild(hint);
        return;
      }
      const arr = selected.kind === 'color' ? g.colorStops : g.alphaStops;
      const stop = arr[selected.index];
      if (!stop) { selected = null; renderEditor(); return; }

      if (selected.kind === 'color') {
        const cStop = stop as ColorStop;
        editor.appendChild(makeEditRow('Color', makeColorSwatch(
          () => cStop.color,
          (c) => {
            cStop.color = [c[0], c[1], c[2], cStop.color[3]];
            redraw();
            refreshHandles();
            this.opts.onChange();
          },
          { showAlpha: false },
        )));
      } else {
        const aStop = stop as AlphaStop;
        editor.appendChild(makeEditRow('Alpha', makeSlider(aStop.alpha, {
          min: 0, max: 1, step: 0.01, precision: 2,
          onChange: (v) => {
            aStop.alpha = v;
            redraw();
            refreshHandles();
            this.opts.onChange();
          },
        })));
      }
    };

    const select = (s: SelectedStop): void => {
      selected = s;
      refreshHandles();
      renderEditor();
    };

    const deleteStop = (kind: 'color' | 'alpha', index: number): void => {
      const arr = kind === 'color' ? g.colorStops : g.alphaStops;
      if (index === 0 || index === arr.length - 1) return;
      arr.splice(index, 1);
      if (selected && selected.kind === kind && selected.index === index) {
        selected = null;
      } else if (selected && selected.kind === kind && selected.index > index) {
        selected = { kind, index: selected.index - 1 };
      }
      redraw();
      refreshHandles();
      renderEditor();
      this.opts.onChange();
    };

    const moveStop = (kind: 'color' | 'alpha', index: number, t: number): void => {
      const arr = kind === 'color' ? g.colorStops : g.alphaStops;
      const stop = arr[index];
      if (!stop) return;
      if (index === 0 || index === arr.length - 1) return; // pin endpoints
      stop.time = Math.max(0, Math.min(1, t));
      arr.sort((a, b) => a.time - b.time);
      const newIdx = (arr as Array<ColorStop | AlphaStop>).indexOf(stop);
      if (selected && selected.kind === kind && selected.index === index) {
        selected = { kind, index: newIdx };
      }
      redraw();
      refreshHandles();
      renderEditor();
      this.opts.onChange();
    };

    const addColorStop = (e: MouseEvent, host: HTMLElement): void => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest('.pi-stop')) return; // hit a handle
      const r = host.getBoundingClientRect();
      const t = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      const c = sampleGradient(g, t);
      const stop: ColorStop = { time: t, color: [c[0], c[1], c[2], 1] };
      g.colorStops.push(stop);
      g.colorStops.sort((x, y) => x.time - y.time);
      selected = { kind: 'color', index: g.colorStops.indexOf(stop) };
      redraw();
      refreshHandles();
      renderEditor();
      this.opts.onChange();
    };
    const addAlphaStop = (e: MouseEvent, host: HTMLElement): void => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest('.pi-stop')) return;
      const r = host.getBoundingClientRect();
      const t = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      const a = sampleGradient(g, t)[3];
      const stop: AlphaStop = { time: t, alpha: a };
      g.alphaStops.push(stop);
      g.alphaStops.sort((x, y) => x.time - y.time);
      selected = { kind: 'alpha', index: g.alphaStops.indexOf(stop) };
      redraw();
      refreshHandles();
      renderEditor();
      this.opts.onChange();
    };

    // Top half of the strip = alpha stop, bottom half = colour stop. The
    // dashed divider + corner labels make the split visible to first-timers.
    canvas.onmousedown = (e) => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest('.pi-stop')) return;
      const r = canvas.getBoundingClientRect();
      if ((e.clientY - r.top) < r.height / 2) {
        addAlphaStop(e, canvas);
      } else {
        addColorStop(e, canvas);
      }
    };
    // Power-user alt paths: clicking the thin handle rows still adds stops.
    colorRow.onmousedown = (e) => addColorStop(e, colorRow);
    alphaRow.onmousedown = (e) => addAlphaStop(e, alphaRow);

    redraw();
    refreshHandles();
    renderEditor();

    // Explicit divider so the color-stop row doesn't visually crash into the
    // selected-stop editor box below.
    const sep = el('div', 'pi-grad-sep');
    outer.append(wrap, sep, editor);
    return outer;
  }

  private makeColorHandle(
    g: GradientData,
    index: number,
    selected: boolean,
    cb: { onSelect: () => void; onDelete: () => void; onDrag: (t: number) => void },
  ): HTMLElement {
    const stop = g.colorStops[index]!;
    const h = el('div', 'pi-stop');
    if (selected) h.classList.add('is-selected');
    h.style.left = `${stop.time * 100}%`;
    h.style.background = rgba(stop.color);
    h.oncontextmenu = (e) => { e.preventDefault(); cb.onDelete(); };
    bindHandleDrag(h, cb.onSelect, cb.onDrag);
    return h;
  }

  private makeAlphaHandle(
    g: GradientData,
    index: number,
    selected: boolean,
    cb: { onSelect: () => void; onDelete: () => void; onDrag: (t: number) => void },
  ): HTMLElement {
    const stop = g.alphaStops[index]!;
    const h = el('div', 'pi-stop');
    if (selected) h.classList.add('is-selected');
    h.style.left = `${stop.time * 100}%`;
    h.style.transform = 'translateX(-5px) translateY(3px)';
    const grey = Math.round(stop.alpha * 255);
    h.style.background = `rgb(${grey},${grey},${grey})`;
    h.oncontextmenu = (e) => { e.preventDefault(); cb.onDelete(); };
    bindHandleDrag(h, cb.onSelect, cb.onDrag);
    return h;
  }
}

const MODE_OPTIONS = [
  { value: 'color' as const, label: 'Color' },
  { value: 'twoColors' as const, label: 'Range' },
  { value: 'gradient' as const, label: 'Gradient' },
  { value: 'twoGradients' as const, label: 'Grads' },
];

function makeEditRow(label: string, control: HTMLElement): HTMLElement {
  const row = el('div', 'pi-grad-edit-row');
  const lbl = el('div', 'pi-grad-edit-lbl');
  lbl.textContent = label;
  row.append(lbl, control);
  return row;
}

/**
 * Click vs drag on a stop handle. Selects on a clean click (no movement),
 * repositions on drag past a 3px threshold. Listens at window-level so the
 * drag survives the cursor leaving the tiny handle box.
 */
function bindHandleDrag(
  handle: HTMLElement,
  onSelect: () => void,
  onDrag: (t: number) => void,
): void {
  handle.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const parent = handle.parentElement;
    if (!parent) return;
    const parentRect = parent.getBoundingClientRect();
    const startX = e.clientX;
    let dragged = false;
    const move = (ev: MouseEvent): void => {
      if (!dragged && Math.abs(ev.clientX - startX) > 3) dragged = true;
      if (dragged) {
        const t = Math.max(0, Math.min(1, (ev.clientX - parentRect.left) / parentRect.width));
        onDrag(t);
      }
    };
    const up = (): void => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      if (!dragged) onSelect();
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  });
}

function rgba(c: ColorRGBA): string {
  return `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${c[3]})`;
}

function drawGradient(canvas: HTMLCanvasElement, g: GradientData): void {
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width;
  const H = canvas.height;
  drawCheckerBg(ctx, W, H);
  const img = ctx.createImageData(W, H);
  for (let x = 0; x < W; x++) {
    const t = x / (W - 1);
    const c = sampleGradient(g, t);
    for (let y = 0; y < H; y++) {
      const i = (y * W + x) * 4;
      img.data[i + 0] = Math.round(c[0] * 255);
      img.data[i + 1] = Math.round(c[1] * 255);
      img.data[i + 2] = Math.round(c[2] * 255);
      img.data[i + 3] = Math.round(c[3] * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
}

function drawCheckerBg(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#3a3a3a';
  for (let y = 0; y < H; y += 8) {
    for (let x = ((y / 8) % 2) * 8; x < W; x += 16) {
      ctx.fillRect(x, y, 8, 8);
    }
  }
}

/**
 * Compact, clickable gradient strip used in the inspector. Acts as a preview;
 * clicking should open a full `openGradientEditor` modal.
 */
export function makeGradientPreview(
  grad: MinMaxGradient,
  size: { width: number; height: number } = { width: 200, height: 20 },
): { element: HTMLElement; refresh: () => void } {
  const wrap = el('div', 'pi-grad-preview');
  const canvas = document.createElement('canvas');
  canvas.className = 'pi-canvas';
  canvas.width = size.width * 2;
  canvas.height = size.height * 2;
  canvas.style.width = '100%';
  canvas.style.height = `${size.height}px`;
  canvas.style.cursor = 'pointer';
  wrap.appendChild(canvas);

  const refresh = (): void => {
    const d = grad.data;
    if (d.mode === 'gradient') {
      drawGradient(canvas, d.gradient);
    } else if (d.mode === 'twoGradients') {
      drawSplitGradients(canvas, d.gradient, d.gradientMax);
    } else if (d.mode === 'color') {
      drawSolidColor(canvas, d.color);
    } else {
      drawSolidColor(canvas, d.color, d.colorMax);
    }
  };
  refresh();
  return { element: wrap, refresh };
}

function drawSolidColor(canvas: HTMLCanvasElement, a: ColorRGBA, b?: ColorRGBA): void {
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width;
  const H = canvas.height;
  drawCheckerBg(ctx, W, H);
  ctx.fillStyle = rgba(a);
  ctx.fillRect(0, 0, b ? W / 2 : W, H);
  if (b) {
    ctx.fillStyle = rgba(b);
    ctx.fillRect(W / 2, 0, W / 2, H);
  }
}

function drawSplitGradients(canvas: HTMLCanvasElement, a: GradientData, b: GradientData): void {
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width;
  const H = canvas.height;
  drawCheckerBg(ctx, W, H);
  const img = ctx.createImageData(W, H);
  const half = Math.floor(H / 2);
  for (let x = 0; x < W; x++) {
    const t = x / (W - 1);
    const ca = sampleGradient(a, t);
    const cb = sampleGradient(b, t);
    for (let y = 0; y < H; y++) {
      const c = y < half ? ca : cb;
      const i = (y * W + x) * 4;
      img.data[i + 0] = Math.round(c[0] * 255);
      img.data[i + 1] = Math.round(c[1] * 255);
      img.data[i + 2] = Math.round(c[2] * 255);
      img.data[i + 3] = Math.round(c[3] * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * Open the full gradient editor as a draggable floating panel. Acts like a
 * tool window (no backdrop, so the user can keep editing other inspector
 * values or pan the 3D scene while it's open). Drag the title bar to move,
 * close with × or Escape. Position is remembered across opens within the
 * session so users don't have to reposition every time they reopen it.
 */
let savedPanelPosition: { x: number; y: number } | null = null;
let openPanelClose: (() => void) | null = null;

export function openGradientEditor(
  anchor: HTMLElement,
  grad: MinMaxGradient,
  opts: { onChange: () => void; title?: string },
): void {
  // Only one gradient panel at a time — close any existing one first.
  openPanelClose?.();

  const modal = el('div', 'pi-modal pi-grad-modal');
  document.body.append(modal);

  const titlebar = el('div', 'pi-modal-titlebar');
  const title = el('div', 'pi-modal-title');
  title.textContent = opts.title ?? 'Gradient Editor';
  const closeBtn = el('button', 'pi-modal-close') as HTMLButtonElement;
  closeBtn.type = 'button';
  closeBtn.innerHTML = '&times;';
  titlebar.append(title, closeBtn);
  modal.appendChild(titlebar);

  const body = el('div', 'pi-modal-body');
  modal.appendChild(body);

  const editor = new GradientEditor(grad, {
    width: 460,
    height: 64,
    onChange: opts.onChange,
  });
  body.appendChild(editor.root);

  // Restore the last drag position when reopening, else anchor near the click.
  if (savedPanelPosition) {
    modal.style.left = `${savedPanelPosition.x}px`;
    modal.style.top = `${savedPanelPosition.y}px`;
  } else {
    const rect = anchor.getBoundingClientRect();
    modal.style.left = `${rect.left}px`;
    modal.style.top = `${rect.bottom + 8}px`;
  }
  // Clamp into viewport on first paint (modal size unknown until laid out).
  requestAnimationFrame(() => {
    const mr = modal.getBoundingClientRect();
    let x = mr.left;
    let y = mr.top;
    if (x + mr.width > window.innerWidth - 8) x = window.innerWidth - mr.width - 8;
    if (y + mr.height > window.innerHeight - 8) y = window.innerHeight - mr.height - 8;
    x = Math.max(8, x);
    y = Math.max(8, y);
    modal.style.left = `${x}px`;
    modal.style.top = `${y}px`;
  });

  // Drag the panel by the title bar — ignore drags that start on the close btn.
  let drag: { dx: number; dy: number } | null = null;
  const onDown = (e: MouseEvent): void => {
    if ((e.target as HTMLElement).closest('.pi-modal-close')) return;
    const r = modal.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    e.preventDefault();
  };
  const onMove = (e: MouseEvent): void => {
    if (!drag) return;
    const w = modal.offsetWidth;
    const h = modal.offsetHeight;
    let x = e.clientX - drag.dx;
    let y = e.clientY - drag.dy;
    x = Math.max(0, Math.min(window.innerWidth - w, x));
    y = Math.max(0, Math.min(window.innerHeight - h, y));
    modal.style.left = `${x}px`;
    modal.style.top = `${y}px`;
  };
  const onUp = (): void => {
    if (drag) {
      const r = modal.getBoundingClientRect();
      savedPanelPosition = { x: r.left, y: r.top };
    }
    drag = null;
  };
  titlebar.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);

  const close = (): void => {
    titlebar.removeEventListener('mousedown', onDown);
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    window.removeEventListener('keydown', onKey);
    editor.destroy();
    modal.remove();
    if (openPanelClose === close) openPanelClose = null;
  };
  const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') close(); };
  window.addEventListener('keydown', onKey);
  closeBtn.onclick = close;
  openPanelClose = close;
}
