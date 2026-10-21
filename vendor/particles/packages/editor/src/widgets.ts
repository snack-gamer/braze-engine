/**
 * Custom widget primitives — replaces Tweakpane so the inspector reads as one
 * cohesive design language. All widgets are imperative and return raw HTMLElements.
 *
 * Style: see theme.ts. Every widget uses `pi-*` class names; no inline styles
 * except for transient state (e.g. swatch fill color).
 */

import { iconCheck } from './icons';

// ---------- panel ----------

export interface PanelOpts {
  title: string;
  icon?: () => SVGSVGElement;
  expanded?: boolean;
  enabled?: boolean;
  onToggle?: (enabled: boolean) => void;
  /** Fires whenever the user expands or collapses the panel header. */
  onExpand?: (expanded: boolean) => void;
}

export interface Panel {
  root: HTMLDivElement;
  body: HTMLDivElement;
  setExpanded(v: boolean): void;
  setEnabled(v: boolean): void;
}

export function makePanel(opts: PanelOpts): Panel {
  const root = el('div', 'pi-panel');
  const header = el('div', 'pi-panel-header');
  const body = el('div', 'pi-panel-body');
  root.append(header, body);

  const chev = el('div', 'pi-chev');
  header.appendChild(chev);

  if (opts.icon) {
    const iconWrap = el('div', 'pi-icon');
    iconWrap.appendChild(opts.icon());
    header.appendChild(iconWrap);
  }

  const name = el('div', 'pi-name');
  name.textContent = opts.title;
  header.appendChild(name);

  let expanded = opts.expanded ?? true;
  let enabled = opts.enabled ?? true;
  let toggleEl: HTMLDivElement | null = null;

  const apply = (): void => {
    root.classList.toggle('is-expanded', expanded);
    root.classList.toggle('is-disabled', !enabled);
    if (toggleEl) toggleEl.dataset.on = enabled ? '1' : '0';
  };

  header.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.pi-panel-toggle')) return;
    expanded = !expanded;
    apply();
    opts.onExpand?.(expanded);
  });

  if (opts.onToggle !== undefined || opts.enabled !== undefined) {
    const tog = el('div', 'pi-panel-toggle');
    tog.appendChild(iconCheck());
    tog.title = enabled ? 'Disable module' : 'Enable module';
    tog.onclick = (e) => {
      e.stopPropagation();
      enabled = !enabled;
      tog.title = enabled ? 'Disable module' : 'Enable module';
      apply();
      opts.onToggle?.(enabled);
    };
    header.appendChild(tog);
    toggleEl = tog;
  }

  apply();

  return {
    root, body,
    setExpanded(v) { expanded = v; apply(); },
    setEnabled(v) { enabled = v; apply(); },
  };
}

// ---------- section group ----------

export type GroupSection = 'system' | 'spawn' | 'particle';

export interface GroupOpts {
  label: string;
  section: GroupSection;
  count?: number;
  expanded?: boolean;
  /** Fires whenever the user expands or collapses the group header. */
  onExpand?: (expanded: boolean) => void;
}

export interface Group {
  root: HTMLDivElement;
  body: HTMLDivElement;
  setCount(n: number): void;
  setExpanded(v: boolean): void;
}

export function makeGroup(opts: GroupOpts): Group {
  const root = el('div', 'pi-group');
  root.dataset.section = opts.section;
  const header = el('div', 'pi-group-header');
  const body = el('div', 'pi-group-body');
  root.append(header, body);

  const chev = el('div', 'pi-group-chev');
  const label = el('div', 'pi-group-label');
  label.textContent = opts.label.toUpperCase();
  const count = el('div', 'pi-group-count');
  if (opts.count != null) count.textContent = String(opts.count);
  header.append(chev, label, count);

  let expanded = opts.expanded ?? true;
  const apply = (): void => { root.classList.toggle('is-expanded', expanded); };
  header.addEventListener('click', () => {
    expanded = !expanded;
    apply();
    opts.onExpand?.(expanded);
  });
  apply();

  return {
    root, body,
    setCount(n) { count.textContent = String(n); },
    setExpanded(v) { expanded = v; apply(); },
  };
}

// ---------- row ----------

export function makeRow(label: string, control: HTMLElement): HTMLDivElement {
  const row = el('div', 'pi-row');
  const l = el('div', 'pi-row-label');
  l.textContent = label;
  const c = el('div', 'pi-row-control');
  c.appendChild(control);
  row.append(l, c);
  installLabelScrub(l, () => singleScrubbable(c));
  return row;
}

export function makeStackRow(label: string, children: HTMLElement[]): HTMLDivElement {
  const row = el('div', 'pi-row');
  row.style.alignItems = 'flex-start';
  const l = el('div', 'pi-row-label');
  l.textContent = label;
  l.style.paddingTop = '3px';
  const stack = el('div', 'pi-stack');
  for (const c of children) stack.appendChild(c);
  row.append(l, stack);
  installLabelScrub(l, () => singleScrubbable(stack));
  return row;
}

export function makeDivider(): HTMLDivElement {
  return el('div', 'pi-divider');
}

// ---------- slider ----------

export interface SliderOpts {
  min: number;
  max: number;
  step?: number;
  precision?: number;
  onChange: (v: number) => void;
}

/**
 * Blender-style slider:
 *  - mousedown captures the starting cursor X and value
 *  - drag changes value by horizontal delta scaled across the slider width
 *  - shift-drag = 10x finer adjustment
 *  - click without drag = enter text-edit mode (no value change)
 * Crucially: clicking does NOT snap the value to the click position.
 */
export function makeSlider(value: number, opts: SliderOpts): HTMLElement {
  const wrap = el('div', 'pi-slider');
  const fill = el('div', 'pi-slider-fill');
  const text = el('div', 'pi-slider-text');
  wrap.append(fill, text);

  const precision = opts.precision ?? autoPrecision(opts.step ?? (opts.max - opts.min) / 100);

  let current = clamp(value, opts.min, opts.max);
  const refresh = (): void => {
    const t = (current - opts.min) / (opts.max - opts.min || 1);
    fill.style.width = `${(t * 100).toFixed(2)}%`;
    text.textContent = current.toFixed(precision);
  };
  refresh();

  const DRAG_THRESHOLD = 3;
  let drag: { startX: number; startValue: number; moved: boolean } | null = null;
  let externalScrubStartValue = current;

  const enterEditMode = (): void => {
    if (wrap.querySelector('input')) return;
    const inp = document.createElement('input');
    inp.className = 'pi-slider-edit';
    inp.value = current.toString();
    inp.type = 'text';
    wrap.appendChild(inp);
    inp.focus();
    inp.select();
    let removed = false;
    const cleanup = (): void => {
      if (removed) return;
      removed = true;
      inp.remove();
    };
    const commit = (): void => {
      const v = parseFloat(inp.value);
      if (!Number.isNaN(v)) {
        current = clamp(v, opts.min, opts.max);
        refresh();
        opts.onChange(current);
      }
      cleanup();
    };
    inp.onblur = commit;
    inp.onkeydown = (e) => {
      if (e.key === 'Enter') commit();
      else if (e.key === 'Escape') cleanup();
    };
  };

  wrap.addEventListener('mousedown', (e) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    e.preventDefault();
    drag = { startX: e.clientX, startValue: current, moved: false };
  });

  const onMove = (e: MouseEvent): void => {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    if (!drag.moved && Math.abs(dx) >= DRAG_THRESHOLD) drag.moved = true;
    if (!drag.moved) return;
    const rect = wrap.getBoundingClientRect();
    const range = opts.max - opts.min;
    const sensitivity = e.shiftKey ? 0.1 : 1.0;
    let v = drag.startValue + (dx / rect.width) * range * sensitivity;
    if (opts.step) v = Math.round(v / opts.step) * opts.step;
    current = clamp(v, opts.min, opts.max);
    refresh();
    opts.onChange(current);
  };

  const onUp = (): void => {
    if (drag && !drag.moved) enterEditMode();
    drag = null;
  };

  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);

  const scrubbable = wrap as ScrubbableElement;
  scrubbable.__piScrubStart = () => {
    externalScrubStartValue = current;
  };
  scrubbable.__piScrub = (dx, fine, coarse) => {
    const range = opts.max - opts.min;
    const sensitivity = fine ? 0.1 : coarse ? 4 : 1;
    let v = externalScrubStartValue + (dx / 180) * range * sensitivity;
    if (opts.step) v = Math.round(v / opts.step) * opts.step;
    current = clamp(v, opts.min, opts.max);
    refresh();
    opts.onChange(current);
  };

  return wrap;
}

// ---------- number ----------

export interface NumberOpts {
  step?: number;
  precision?: number;
  min?: number;
  max?: number;
  commitOnInput?: boolean;
  onChange: (v: number) => void;
}

/**
 * Plain number input. Commits on `change` (blur or Enter), not on every keystroke,
 * so the GPU isn't hammered while the user types a multi-digit value.
 */
export function makeNumber(value: number, opts: NumberOpts): HTMLElement {
  const inp = document.createElement('input');
  inp.type = 'number';
  inp.className = 'pi-number';
  inp.value = formatNum(value, opts.precision);
  if (opts.step != null) inp.step = String(opts.step);
  if (opts.min != null) inp.min = String(opts.min);
  if (opts.max != null) inp.max = String(opts.max);
  const commit = (): void => {
    let v = parseFloat(inp.value);
    if (Number.isNaN(v)) { inp.value = formatNum(value, opts.precision); return; }
    if (opts.min != null) v = Math.max(opts.min, v);
    if (opts.max != null) v = Math.min(opts.max, v);
    inp.value = formatNum(v, opts.precision);
    opts.onChange(v);
  };
  inp.onchange = commit;
  if (opts.commitOnInput) {
    inp.oninput = () => {
      if (inp.value === '' || inp.value === '-' || inp.value === '.') return;
      commit();
    };
  }
  const commitScrubValue = (v: number): void => {
    const next = clampNumber(v, opts.min, opts.max);
    inp.value = formatNum(next, opts.precision);
    opts.onChange(next);
  };
  let scrubStartValue = value;
  const scrubbable = inp as ScrubbableElement;
  scrubbable.__piScrubStart = () => {
    const parsed = parseFloat(inp.value);
    scrubStartValue = Number.isFinite(parsed) ? parsed : value;
  };
  scrubbable.__piScrub = (dx, fine, coarse) => {
    const step = scrubStep(inp, opts);
    const sensitivity = fine ? 0.1 : coarse ? 10 : 1;
    commitScrubValue(scrubStartValue + dx * step * sensitivity);
  };
  return inp;
}

// ---------- toggle ----------

export function makeToggle(value: boolean, onChange: (v: boolean) => void): HTMLElement {
  const t = el('div', 'pi-toggle');
  t.appendChild(iconCheck());
  t.dataset.on = value ? '1' : '0';
  t.onclick = () => {
    const next = !(t.dataset.on === '1');
    t.dataset.on = next ? '1' : '0';
    onChange(next);
  };
  return t;
}

// ---------- dropdown ----------

export interface DropdownOption<T> {
  value: T;
  label: string;
}

export function makeDropdown<T extends string | number>(
  value: T,
  options: DropdownOption<T>[],
  onChange: (v: T) => void,
  variant: 'full' | 'mini' = 'full',
): HTMLElement {
  const drop = el('div', variant === 'mini' ? 'pi-mini-dropdown' : 'pi-dropdown');
  const current = options.find((o) => o.value === value);
  drop.textContent = current?.label ?? String(value);
  drop.onclick = (e) => {
    e.stopPropagation();
    openMenu(drop, options.map((o) => ({
      label: o.label,
      onClick: () => {
        drop.textContent = o.label;
        onChange(o.value);
      },
    })));
  };
  return drop;
}

// ---------- color swatch ----------

/**
 * Color swatch that opens a themed HSV picker on click. Takes a `getColor`
 * getter (not a value) so it always shows the current colour even after parent
 * state mutations. Calls `onChange` continuously as the user drags inside
 * the picker.
 */
export function makeColorSwatch(
  getColor: () => readonly [number, number, number, number],
  onChange: (c: [number, number, number, number]) => void,
  opts: { showAlpha?: boolean } = {},
): HTMLElement {
  const sw = el('div', 'pi-swatch');
  const fill = el('div', 'pi-swatch-fill');
  sw.appendChild(fill);

  const refresh = (): void => { fill.style.background = rgba(getColor()); };
  refresh();

  sw.onclick = (e) => {
    e.stopPropagation();
    openColorPicker(sw, {
      initial: getColor(),
      showAlpha: opts.showAlpha ?? true,
      onChange: (c) => { onChange(c); refresh(); },
    });
  };
  return sw;
}

// ---------- color picker ----------

export interface ColorPickerOpts {
  initial: readonly [number, number, number, number];
  showAlpha?: boolean;
  onChange: (c: [number, number, number, number]) => void;
}

/**
 * Themed HSV color picker popover — matches the rest of the inspector instead
 * of opening the OS's native color dialog. Standard Photoshop layout: SV
 * square + hue strip (+ alpha strip), hex + alpha number inputs at the bottom.
 */
export function openColorPicker(anchor: HTMLElement, opts: ColorPickerOpts): void {
  const showAlpha = opts.showAlpha ?? true;
  const rect = anchor.getBoundingClientRect();
  const popup = el('div', 'pi-cpicker');
  document.body.append(popup);

  let r = opts.initial[0], g = opts.initial[1], b = opts.initial[2], a = opts.initial[3];
  let [h, s, v] = rgbToHsv(r, g, b);

  const sv = el('div', 'pi-cpicker-sv');
  const svHandle = el('div', 'pi-cpicker-handle pi-cpicker-handle-sv');
  sv.appendChild(svHandle);

  const hue = el('div', 'pi-cpicker-hue');
  const hueHandle = el('div', 'pi-cpicker-handle pi-cpicker-handle-strip');
  hue.appendChild(hueHandle);

  let alphaStrip: HTMLElement | null = null;
  let alphaFill: HTMLElement | null = null;
  let alphaHandle: HTMLElement | null = null;
  if (showAlpha) {
    alphaStrip = el('div', 'pi-cpicker-alpha');
    alphaFill = el('div', 'pi-cpicker-alpha-fill');
    alphaHandle = el('div', 'pi-cpicker-handle pi-cpicker-handle-strip');
    alphaStrip.append(alphaFill, alphaHandle);
  }

  const inputsRow = el('div', 'pi-cpicker-inputs');
  const hexInput = document.createElement('input');
  hexInput.className = 'pi-cpicker-hex';
  hexInput.type = 'text';
  hexInput.maxLength = 7;
  hexInput.spellcheck = false;
  inputsRow.appendChild(hexInput);

  let alphaInput: HTMLInputElement | null = null;
  if (showAlpha) {
    alphaInput = document.createElement('input');
    alphaInput.className = 'pi-cpicker-anum';
    alphaInput.type = 'number';
    alphaInput.min = '0'; alphaInput.max = '1'; alphaInput.step = '0.01';
    inputsRow.appendChild(alphaInput);
  }

  popup.appendChild(sv);
  popup.appendChild(hue);
  if (alphaStrip) popup.appendChild(alphaStrip);
  popup.appendChild(inputsRow);

  popup.style.left = `${rect.left}px`;
  popup.style.top = `${rect.bottom + 4}px`;
  // Flip above / shift left if it overflows.
  requestAnimationFrame(() => {
    const pr = popup.getBoundingClientRect();
    if (pr.right > window.innerWidth - 8) {
      popup.style.left = `${Math.max(8, window.innerWidth - pr.width - 8)}px`;
    }
    if (pr.bottom > window.innerHeight - 8) {
      popup.style.top = `${Math.max(8, rect.top - pr.height - 4)}px`;
    }
  });

  const render = (): void => {
    sv.style.background =
      `linear-gradient(to top, #000, transparent),` +
      `linear-gradient(to right, #fff, hsl(${h}, 100%, 50%))`;
    svHandle.style.left = `${s * 100}%`;
    svHandle.style.top = `${(1 - v) * 100}%`;
    hueHandle.style.left = `${(h / 360) * 100}%`;
    if (alphaFill && alphaHandle) {
      const ri = Math.round(r * 255);
      const gi = Math.round(g * 255);
      const bi = Math.round(b * 255);
      alphaFill.style.background = `linear-gradient(to right, rgba(${ri},${gi},${bi},0), rgb(${ri},${gi},${bi}))`;
      alphaHandle.style.left = `${a * 100}%`;
    }
    hexInput.value = `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`.toUpperCase();
    if (alphaInput && document.activeElement !== alphaInput) alphaInput.value = a.toFixed(2);
  };

  const emit = (): void => {
    [r, g, b] = hsvToRgb(h, s, v);
    render();
    opts.onChange([r, g, b, a]);
  };

  render();

  const cleanups: Array<() => void> = [];
  const bindDrag = (target: HTMLElement, onPos: (px: number, py: number) => void): void => {
    let dragging = false;
    const handle = (e: MouseEvent): void => {
      const rr = target.getBoundingClientRect();
      const px = clamp01((e.clientX - rr.left) / rr.width);
      const py = clamp01((e.clientY - rr.top) / rr.height);
      onPos(px, py);
    };
    const down = (e: MouseEvent): void => { dragging = true; handle(e); e.preventDefault(); };
    const move = (e: MouseEvent): void => { if (dragging) handle(e); };
    const up = (): void => { dragging = false; };
    target.addEventListener('mousedown', down);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    cleanups.push(() => {
      target.removeEventListener('mousedown', down);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    });
  };

  bindDrag(sv, (px, py) => { s = px; v = 1 - py; emit(); });
  bindDrag(hue, (px) => { h = px * 360; emit(); });
  if (alphaStrip) bindDrag(alphaStrip, (px) => { a = px; emit(); });

  hexInput.onchange = () => {
    const parsed = parseHexColor(hexInput.value.trim());
    if (parsed) {
      [r, g, b] = parsed;
      [h, s, v] = rgbToHsv(r, g, b);
      render();
      opts.onChange([r, g, b, a]);
    } else {
      hexInput.value = `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`.toUpperCase();
    }
  };
  if (alphaInput) {
    alphaInput.onchange = () => {
      const x = parseFloat(alphaInput!.value);
      if (!Number.isNaN(x)) { a = Math.max(0, Math.min(1, x)); emit(); }
    };
  }

  const close = (): void => {
    for (const c of cleanups) c();
    popup.remove();
  };
  // Close on any click outside the popup (including clicks inside other
  // floating panels like the gradient editor — a backdrop element doesn't
  // catch those since the gradient panel sits above it). setTimeout(0) so the
  // mousedown that opened this picker doesn't immediately close it.
  const onDocDown = (e: MouseEvent): void => {
    if (!popup.contains(e.target as Node)) close();
  };
  setTimeout(() => document.addEventListener('mousedown', onDocDown, true), 0);
  cleanups.push(() => document.removeEventListener('mousedown', onDocDown, true));
  const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') close(); };
  window.addEventListener('keydown', onKey);
  cleanups.push(() => window.removeEventListener('keydown', onKey));
}

/** Small popover for editing a single 0..1 value. Used by gradient alpha stops. */
export function openValuePicker(
  anchor: HTMLElement,
  initial: number,
  opts: { min?: number; max?: number; step?: number; precision?: number; label?: string; onChange: (v: number) => void },
): void {
  const rect = anchor.getBoundingClientRect();
  const popup = el('div', 'pi-vpopup');
  document.body.append(popup);
  popup.style.left = `${rect.left}px`;
  popup.style.top = `${rect.bottom + 4}px`;

  if (opts.label) {
    const lbl = el('div', 'pi-vpopup-label');
    lbl.textContent = opts.label;
    popup.appendChild(lbl);
  }
  popup.appendChild(makeSlider(initial, {
    min: opts.min ?? 0,
    max: opts.max ?? 1,
    step: opts.step ?? 0.01,
    precision: opts.precision ?? 2,
    onChange: opts.onChange,
  }));

  requestAnimationFrame(() => {
    const pr = popup.getBoundingClientRect();
    if (pr.right > window.innerWidth - 8) {
      popup.style.left = `${Math.max(8, window.innerWidth - pr.width - 8)}px`;
    }
  });

  const close = (): void => {
    document.removeEventListener('mousedown', onDocDown, true);
    window.removeEventListener('keydown', onKey);
    popup.remove();
  };
  const onDocDown = (e: MouseEvent): void => {
    if (!popup.contains(e.target as Node)) close();
  };
  setTimeout(() => document.addEventListener('mousedown', onDocDown, true), 0);
  const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') close(); };
  window.addEventListener('keydown', onKey);
}

function clamp01(v: number): number { return Math.max(0, Math.min(1, v)); }

function toHex2(v: number): string {
  return Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, '0');
}

function parseHexColor(s: string): [number, number, number] | null {
  let hex = s.startsWith('#') ? s.slice(1) : s;
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  if (hex.length !== 6 || !/^[0-9a-fA-F]+$/.test(hex)) return null;
  return [
    parseInt(hex.slice(0, 2), 16) / 255,
    parseInt(hex.slice(2, 4), 16) / 255,
    parseInt(hex.slice(4, 6), 16) / 255,
  ];
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return [h, s, max];
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  const c = v * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0, g1 = 0, b1 = 0;
  if (hp < 1)      { r1 = c; g1 = x; }
  else if (hp < 2) { r1 = x; g1 = c; }
  else if (hp < 3) { g1 = c; b1 = x; }
  else if (hp < 4) { g1 = x; b1 = c; }
  else if (hp < 5) { r1 = x; b1 = c; }
  else             { r1 = c; b1 = x; }
  const m = v - c;
  return [r1 + m, g1 + m, b1 + m];
}

// ---------- image upload ----------

export interface ImageUploadOpts {
  current?: string;
  onChange: (dataUrl: string | undefined) => void;
}

/**
 * Two-state image slot: either a "Choose Image…" button, or a thumbnail
 * preview + clear (×) button when something's been uploaded. The dataUrl
 * round-trips through the module config and persists with the system.
 */
export function makeImageUpload(opts: ImageUploadOpts): HTMLElement {
  const wrap = el('div', 'pi-image-upload');
  let current = opts.current;

  const render = (): void => {
    wrap.innerHTML = '';
    if (current) {
      const thumb = document.createElement('img');
      thumb.className = 'pi-image-thumb';
      thumb.src = current;
      thumb.alt = 'custom texture';
      const label = el('div', 'pi-image-name');
      label.textContent = `Custom · ${approxSize(current)}`;
      const clear = el('button', 'pi-image-clear') as HTMLButtonElement;
      clear.type = 'button';
      clear.title = 'Remove custom image';
      clear.textContent = '×';
      clear.onclick = () => {
        current = undefined;
        opts.onChange(undefined);
        render();
      };
      wrap.append(thumb, label, clear);
    } else {
      const btn = el('button', 'pi-image-pick') as HTMLButtonElement;
      btn.type = 'button';
      btn.textContent = 'Choose Image…';
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.style.display = 'none';
      btn.onclick = () => input.click();
      input.onchange = async () => {
        const f = input.files?.[0];
        if (!f) return;
        const url = await fileToDataUrl(f);
        current = url;
        opts.onChange(url);
        render();
      };
      wrap.append(btn, input);
    }
  };
  render();
  return wrap;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function approxSize(dataUrl: string): string {
  // Rough kb estimate of base64 payload, for the label hint.
  const i = dataUrl.indexOf(',');
  const bytes = (dataUrl.length - i - 1) * 0.75;
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ---------- menu ----------

export interface MenuItem {
  label: string;
  icon?: () => SVGSVGElement;
  tag?: string;
  shortcut?: string;
  disabled?: boolean;
  onClick?: () => void;
  separator?: boolean;
}

export function openMenu(anchor: HTMLElement, items: MenuItem[]): void {
  const rect = anchor.getBoundingClientRect();
  const backdrop = el('div', 'pi-backdrop');
  const menu = el('div', 'pi-menu');
  document.body.appendChild(backdrop);
  document.body.appendChild(menu);

  function close(): void { backdrop.remove(); menu.remove(); }
  backdrop.onclick = close;

  // Build items BEFORE positioning so the menu has its real height when we
  // decide whether to flip above the anchor. The previous version positioned
  // first, measured an empty menu (height=0), and never flipped.
  for (const it of items) {
    if (it.separator) { menu.appendChild(el('div', 'pi-menu-sep')); continue; }
    const item = el('div', 'pi-menu-item');
    if (it.disabled) item.setAttribute('aria-disabled', 'true');
    if (it.icon) {
      const iw = el('div', 'pi-menu-icon');
      iw.appendChild(it.icon());
      item.appendChild(iw);
    }
    const lbl = document.createElement('span');
    lbl.textContent = it.label;
    item.appendChild(lbl);
    if (it.tag || it.shortcut) {
      const sp = el('div', 'pi-menu-spacer');
      item.appendChild(sp);
      if (it.shortcut) {
        const sc = el('div', 'pi-menu-shortcut');
        sc.textContent = it.shortcut;
        item.appendChild(sc);
      }
      if (it.tag) {
        const tag = el('div', 'pi-menu-tag');
        tag.textContent = it.tag;
        item.appendChild(tag);
      }
    }
    if (!it.disabled) {
      item.onclick = () => { close(); it.onClick?.(); };
    }
    menu.appendChild(item);
  }

  // Position with proper height: prefer below, flip above if it overflows,
  // and fall back to scrolling within whichever side has more room.
  const PAD = 8;
  const mh = menu.offsetHeight;
  const mw = menu.offsetWidth;
  const spaceBelow = window.innerHeight - rect.bottom - PAD;
  const spaceAbove = rect.top - PAD;
  if (mh + 4 <= spaceBelow) {
    menu.style.top = `${rect.bottom + 4}px`;
  } else if (mh + 4 <= spaceAbove) {
    menu.style.top = `${rect.top - mh - 4}px`;
  } else if (spaceBelow >= spaceAbove) {
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.maxHeight = `${spaceBelow - 4}px`;
    menu.style.overflowY = 'auto';
  } else {
    menu.style.top = `${PAD}px`;
    menu.style.maxHeight = `${spaceAbove - 4}px`;
    menu.style.overflowY = 'auto';
  }
  let left = rect.left;
  if (left + mw > window.innerWidth - PAD) {
    left = Math.max(PAD, window.innerWidth - mw - PAD);
  }
  menu.style.left = `${left}px`;
}

// ---------- helpers ----------

type ScrubbableElement = HTMLElement & {
  __piScrubStart?: () => void;
  __piScrub?: (dx: number, fine: boolean, coarse: boolean) => void;
};

function installLabelScrub(label: HTMLElement, resolve: () => ScrubbableElement | null): void {
  let drag: {
    target: ScrubbableElement;
    startX: number;
    moved: boolean;
    pointerId: number;
  } | null = null;

  const refresh = (): void => {
    label.classList.toggle('is-scrubbable', !!resolve());
  };
  refresh();
  label.addEventListener('mouseenter', refresh);
  label.addEventListener('pointerdown', (event) => {
    const target = resolve();
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    label.setPointerCapture(event.pointerId);
    target.__piScrubStart?.();
    drag = {
      target,
      startX: event.clientX,
      moved: false,
      pointerId: event.pointerId,
    };
    label.classList.add('is-scrubbing');
    document.body.classList.add('pi-is-scrubbing');
  });
  label.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.startX;
    if (!drag.moved && Math.abs(dx) < 2) return;
    drag.moved = true;
    drag.target.__piScrub?.(dx, event.shiftKey, event.altKey);
  });
  const stop = (event: PointerEvent): void => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag = null;
    label.classList.remove('is-scrubbing');
    document.body.classList.remove('pi-is-scrubbing');
    if (label.hasPointerCapture(event.pointerId)) label.releasePointerCapture(event.pointerId);
  };
  label.addEventListener('pointerup', stop);
  label.addEventListener('pointercancel', stop);
}

export function bindScrubLabel(label: HTMLElement, target: HTMLElement): void {
  installLabelScrub(label, () => {
    const maybe = target as ScrubbableElement;
    return typeof maybe.__piScrub === 'function' ? maybe : null;
  });
}

function singleScrubbable(root: HTMLElement): ScrubbableElement | null {
  const items = Array.from(root.querySelectorAll<HTMLElement>('.pi-number, .pi-slider'))
    .filter((item): item is ScrubbableElement => {
      const maybe = item as ScrubbableElement;
      return typeof maybe.__piScrub === 'function';
    });
  return items.length === 1 ? items[0]! : null;
}

function clampNumber(v: number, min?: number, max?: number): number {
  let next = v;
  if (min != null) next = Math.max(min, next);
  if (max != null) next = Math.min(max, next);
  return next;
}

function scrubStep(input: HTMLInputElement, opts: NumberOpts): number {
  if (opts.step != null && opts.step > 0) return opts.step / 4;
  const parsed = Number(input.step);
  if (Number.isFinite(parsed) && parsed > 0) return parsed / 4;
  if (opts.precision != null) return 1 / (10 ** opts.precision);
  return 0.01;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

export function makePair(min: HTMLElement, max: HTMLElement): HTMLElement {
  const wrap = el('div', 'pi-pair');
  const sep = el('div', 'pi-pair-sep');
  sep.textContent = '–';
  wrap.append(min, sep, max);
  return wrap;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function autoPrecision(step: number): number {
  if (step >= 1) return 0;
  if (step >= 0.1) return 1;
  if (step >= 0.01) return 2;
  if (step >= 0.001) return 3;
  return 4;
}

function formatNum(n: number, precision?: number): string {
  if (precision != null) return n.toFixed(precision);
  if (Math.abs(n) >= 100) return n.toFixed(1);
  if (Math.abs(n) >= 1) return n.toFixed(2);
  return n.toFixed(3);
}

export function rgba(c: readonly [number, number, number, number]): string {
  return `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${c[3]})`;
}

export function rgbHex(c: readonly [number, number, number, number]): string {
  const h = (n: number): string => Math.max(0, Math.min(255, Math.round(n * 255))).toString(16).padStart(2, '0');
  return `#${h(c[0])}${h(c[1])}${h(c[2])}`;
}

export function parseHex(s: string): [number, number, number, number] {
  const r = parseInt(s.slice(1, 3), 16) / 255;
  const g = parseInt(s.slice(3, 5), 16) / 255;
  const b = parseInt(s.slice(5, 7), 16) / 255;
  return [r, g, b, 1];
}
