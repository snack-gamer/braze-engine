import { MinMaxCurve, sampleKeys, type Keyframe } from '@particles/core';
import { el, makeDropdown, makeNumber, makePair } from './widgets';

export interface CurveEditorOptions {
  width?: number;
  height?: number;
  onChange: () => void;
}

/**
 * Compact MinMaxCurve editor. Lays out as:
 *   [ inline value(s)            ][ mode picker ]
 *   [ canvas thumbnail (curve modes only)        ]
 *
 * Returned `.root` is a column flex element designed to slot into pi-row-control
 * via the inspector's makeStackRow helper.
 */
export class CurveEditor {
  readonly root: HTMLDivElement;
  private curve: MinMaxCurve;
  private opts: Required<CurveEditorOptions>;
  private canvas?: HTMLCanvasElement;
  private dragKey: { keys: Keyframe[]; index: number } | null = null;

  constructor(curve: MinMaxCurve, opts: CurveEditorOptions) {
    this.curve = curve;
    this.opts = { width: 200, height: 56, ...opts };
    this.root = el('div');
    this.root.style.cssText = 'display:flex;flex-direction:column;gap:3px;min-width:0;';
    this.render();
  }

  setCurve(curve: MinMaxCurve): void {
    this.curve = curve;
    this.render();
  }

  destroy(): void {
    window.removeEventListener('mousemove', this.onMove);
    window.removeEventListener('mouseup', this.onUp);
    this.root.remove();
  }

  private render(): void {
    this.root.innerHTML = '';

    // Top row: value(s) + mode picker
    const topRow = el('div');
    topRow.style.cssText = 'display:flex;align-items:center;gap:4px;min-width:0;';

    const valueArea = el('div');
    valueArea.style.cssText = 'display:flex;align-items:center;gap:4px;flex:1;min-width:0;';
    topRow.appendChild(valueArea);

    const modeSel = makeDropdown(
      this.curve.data.mode,
      MODE_OPTIONS,
      (m) => {
        this.curve.data.mode = m;
        this.render();
        this.opts.onChange();
      },
      'mini',
    );
    topRow.appendChild(modeSel);
    this.root.appendChild(topRow);

    switch (this.curve.data.mode) {
      case 'constant':
        valueArea.appendChild(makeNumber(this.curve.data.constant, {
          onChange: (v) => { this.curve.data.constant = v; this.opts.onChange(); },
        }));
        break;
      case 'twoConstants':
        valueArea.appendChild(makePair(
          makeNumber(this.curve.data.constant, {
            onChange: (v) => { this.curve.data.constant = v; this.opts.onChange(); },
          }),
          makeNumber(this.curve.data.constantMax, {
            onChange: (v) => { this.curve.data.constantMax = v; this.opts.onChange(); },
          }),
        ));
        break;
      case 'curve':
        valueArea.appendChild(this.makeMiniCurve(this.curve.data.curve));
        break;
      case 'twoCurves': {
        const stack = el('div');
        stack.style.cssText = 'display:flex;flex-direction:column;gap:3px;flex:1;min-width:0;';
        stack.appendChild(this.makeMiniCurve(this.curve.data.curve));
        stack.appendChild(this.makeMiniCurve(this.curve.data.curveMax));
        valueArea.appendChild(stack);
        break;
      }
    }
  }

  private makeMiniCurve(keys: Keyframe[]): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.className = 'pi-canvas';
    canvas.width = this.opts.width * 2;
    canvas.height = this.opts.height * 2;
    canvas.style.width = '100%';
    canvas.style.height = `${this.opts.height}px`;
    canvas.style.cursor = 'crosshair';
    const draw = (): void => drawCurve(canvas, keys);
    draw();

    canvas.addEventListener('mousedown', (e) => {
      const rect = canvas.getBoundingClientRect();
      const tx = clamp((e.clientX - rect.left) / rect.width, 0, 1);
      const ty = clamp(1 - (e.clientY - rect.top) / rect.height, 0, 1);

      let hit = -1;
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i]!;
        const dx = (k.time - tx) * rect.width;
        const dy = (k.value - ty) * rect.height;
        if (Math.hypot(dx, dy) < 8) { hit = i; break; }
      }
      if (e.button === 2 && hit > 0 && hit < keys.length - 1) {
        keys.splice(hit, 1);
        draw();
        this.opts.onChange();
        return;
      }
      if (hit < 0) {
        keys.push({ time: tx, value: ty });
        keys.sort((a, b) => a.time - b.time);
        hit = keys.findIndex((k) => k.time === tx && k.value === ty);
        draw();
        this.opts.onChange();
      }
      this.dragKey = { keys, index: hit };
      this.canvas = canvas;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('mousemove', this.onMove);
    window.addEventListener('mouseup', this.onUp);
    return canvas;
  }

  private onMove = (e: MouseEvent): void => {
    if (!this.dragKey || !this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const t = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const v = clamp(1 - (e.clientY - rect.top) / rect.height, 0, 1);
    const k = this.dragKey.keys[this.dragKey.index]!;
    const last = this.dragKey.keys.length - 1;
    if (this.dragKey.index !== 0 && this.dragKey.index !== last) k.time = t;
    k.value = v;
    this.dragKey.keys.sort((a, b) => a.time - b.time);
    drawCurve(this.canvas, this.dragKey.keys);
    this.opts.onChange();
  };

  private onUp = (): void => { this.dragKey = null; };
}

const MODE_OPTIONS = [
  { value: 'constant' as const, label: 'Const' },
  { value: 'twoConstants' as const, label: 'Range' },
  { value: 'curve' as const, label: 'Curve' },
  { value: 'twoCurves' as const, label: 'Curves' },
];

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function drawCurve(canvas: HTMLCanvasElement, keys: readonly Keyframe[]): void {
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // Subtle grid
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < 4; i++) {
    const x = (i / 4) * W;
    const y = (i / 4) * H;
    ctx.moveTo(x, 0); ctx.lineTo(x, H);
    ctx.moveTo(0, y); ctx.lineTo(W, y);
  }
  ctx.stroke();

  // Area under curve. Sample with core's sampleKeys (Hermite when tangents are
  // present) so the preview matches what bakeCurveLUT feeds the GPU.
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = 0; x < W; x++) {
    const t = x / (W - 1);
    const v = sampleKeys(keys, t);
    ctx.lineTo(x, H - v * H);
  }
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fillStyle = 'rgba(74, 144, 226, 0.18)';
  ctx.fill();

  // Curve line
  ctx.strokeStyle = '#5fa0ef';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x < W; x++) {
    const t = x / (W - 1);
    const v = sampleKeys(keys, t);
    const y = H - v * H;
    if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Keys
  for (const k of keys) {
    const x = k.time * W;
    const y = H - k.value * H;
    ctx.fillStyle = '#1a1a1a';
    ctx.strokeStyle = '#e8e8e8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}
