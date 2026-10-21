/**
 * Blender 4.x-inspired theme.
 *
 * Design system:
 *  - Inspector body is a darker base. Each module is a "card" with a slightly
 *    lighter background so panels read as distinct objects, separated by a
 *    1px dark line.
 *  - Inputs are darker than cards — they sit recessed into the panel.
 *  - One accent color (blue) for selection and active state.
 *  - 11px Inter/system font, 22-24px row heights, 3px corner radius.
 */

export const THEME_ID = 'particles-blender-theme';

export function injectTheme(): void {
  if (document.getElementById(THEME_ID)) return;
  const style = document.createElement('style');
  style.id = THEME_ID;
  style.textContent = THEME_CSS;
  document.head.appendChild(style);
}

const THEME_CSS =  `
:root {

  --bl-bg:           #1a1a1a;
  --bl-card:         #262626;
  --bl-card-2:       #2c2c2c;
  --bl-header:       #303030;
  --bl-header-hover: #383838;
  --bl-input:        #161616;
  --bl-input-hover:  #1c1c1c;
  --bl-input-focus:  #1f1f1f;
  --bl-input-fill:   #2a3a55;
  --bl-input-fill-h: #324466;

  --bl-text:         #c8c8c8;
  --bl-text-strong:  #e8e8e8;
  --bl-text-dim:     #8a8a8a;
  --bl-text-faint:   #5a5a5a;

  --bl-accent:       #4a90e2;
  --bl-accent-hi:    #5fa0ef;
  --bl-accent-soft:  rgba(74, 144, 226, 0.18);
  --bl-good:         #6dc05b;
  --bl-warn:         #d8a050;
  --bl-bad:          #cf4040;

  --bl-border:       #0e0e0e;
  --bl-sep:          #141414;
  --bl-divider:      #1f1f1f;
  --bl-checker:      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3Cpath fill='%23282828' d='M0 0h8v8H0z'/%3E%3Cpath fill='%23444444' d='M0 0h4v4H0zM4 4h4v4H4z'/%3E%3C/svg%3E");

  --bl-font:         -apple-system, "SF Pro Text", "Inter", "Segoe UI", system-ui, sans-serif;
  --bl-fs:           11px;
  --bl-fs-sm:        10px;
  --bl-fs-mono:      11px;
  --bl-mono:         ui-monospace, "SF Mono", "Roboto Mono", Menlo, monospace;
  --bl-row-h:        18px;
  --bl-input-h:      17px;
  --bl-radius:       2px;
  --bl-radius-lg:    4px;
}



.ef-root {
  flex: none;
  display: flex;
  flex-direction: column;
  min-height: 124px;
  max-height: 220px;
  background: var(--bl-bg);
  border-bottom: 1px solid var(--bl-border);
  color: var(--bl-text);
  font: var(--bl-fs)/1.4 var(--bl-font);
  user-select: none;
}
.ef-header {
  height: 24px;
  padding: 0 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  background: #222;
  border-bottom: 1px solid var(--bl-border);
}
.ef-title {
  flex: 1;
  color: var(--bl-text-strong);
  font-weight: 700;
}
.ef-meta {
  font: 10px var(--bl-mono);
  color: var(--bl-text-dim);
}
.ef-rows {
  flex: 1;
  overflow-y: auto;
  padding: 3px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ef-section {
  box-sizing: border-box;
  height: 16px;
  padding: 3px 5px 0;
  color: var(--bl-text-dim);
  font: 9px var(--bl-font);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.ef-track-spacer {
  display: none;
}
.ef-row {
  height: 28px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 22px 22px 22px 22px;
  align-items: center;
  gap: 1px;
  padding: 0 3px 0 8px;
  background: var(--bl-card);
  border: 1px solid var(--bl-border);
  border-radius: var(--bl-radius);
  cursor: pointer;
}
.ef-row:hover { background: var(--bl-card-2); }
.ef-row[data-selected="1"] {
  background: var(--bl-accent-soft);
  border-color: rgba(74, 144, 226, 0.55);
}
.ef-row[data-muted="1"] .ef-label {
  opacity: 0.48;
}
.ef-row[data-kind="emitter"][data-event="1"] .ef-name::before {
  content: "EVENT";
  display: inline-block;
  margin-right: 6px;
  color: #c79bff;
  font: 8px var(--bl-font);
  font-weight: 700;
  letter-spacing: 0.08em;
}
.ef-row[data-kind="effector"] .ef-name::before {
  content: "FIELD";
  display: inline-block;
  margin-right: 6px;
  color: var(--bl-accent-hi);
  font: 8px var(--bl-font);
  font-weight: 700;
  letter-spacing: 0.08em;
}
.ef-row[data-kind="collider"] .ef-name::before {
  content: "COL";
  display: inline-block;
  margin-right: 6px;
  color: #d8a050;
  font: 8px var(--bl-font);
  font-weight: 700;
  letter-spacing: 0.08em;
}
.ef-label {
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 1px;
}
.ef-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--bl-text-strong);
  font-weight: 600;
}
.ef-sub {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--bl-text-dim);
  font: 9px var(--bl-mono);
}
.ef-icon-btn {
  width: 20px;
  height: 20px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: var(--bl-text-dim);
  border: 0;
  border-radius: var(--bl-radius);
  font: 10px/1 var(--bl-font);
  font-weight: 700;
  cursor: pointer;
}
.ef-icon-btn:hover {
  background: var(--bl-header-hover);
  color: var(--bl-text-strong);
}
.ef-icon-btn:disabled {
  opacity: 0.28;
  pointer-events: none;
}
.ef-icon-btn svg {
  width: 12px;
  height: 12px;
  fill: currentColor;
}
.ef-icon-btn[data-active="1"] {
  color: var(--bl-accent-hi);
}
.ef-solo[data-active="1"] {
  background: var(--bl-accent);
  color: #fff;
}
.ef-props {
  flex: none;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 72px 72px 72px;
  gap: 4px;
  padding: 4px;
  background: #181818;
  border-top: 1px solid var(--bl-border);
}
.ef-prop {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 4px;
}
.ef-prop span {
  flex: none;
  color: var(--bl-text-dim);
  font: 9px var(--bl-font);
}
.ef-prop input {
  min-width: 0;
  width: 100%;
  height: 18px;
  padding: 0 5px;
  background: var(--bl-input);
  color: var(--bl-text-strong);
  border: 1px solid var(--bl-border);
  border-radius: var(--bl-radius);
  font: 10px var(--bl-font);
}
.ef-prop input:focus {
  outline: 1px solid var(--bl-accent);
  outline-offset: -1px;
}
.ef-prop input:disabled {
  opacity: 0.45;
}
.ef-footer {
  height: 28px;
  padding: 4px;
  border-top: 1px solid var(--bl-border);
  background: #1f1f1f;
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 4px;
}
.ef-add {
  width: 100%;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  background: var(--bl-header);
  color: var(--bl-text-strong);
  border: 1px solid var(--bl-border);
  border-radius: var(--bl-radius);
  font: 10px/1 var(--bl-font);
  font-weight: 700;
  cursor: pointer;
}
.ef-add:hover {
  background: var(--bl-header-hover);
  border-color: var(--bl-accent);
}
.ef-add svg {
  width: 9px;
  height: 9px;
  fill: currentColor;
}



.pi-root {
  position: fixed;
  top: 8px; right: 8px;
  width: 400px;
  max-height: calc(100vh - 16px);
  display: flex; flex-direction: column;
  background: var(--bl-bg);
  color: var(--bl-text);
  font: var(--bl-fs)/1.4 var(--bl-font);
  border: 1px solid var(--bl-border);
  border-radius: var(--bl-radius-lg);
  box-shadow: 0 10px 32px rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.04) inset;
  z-index: 9999;
  -webkit-font-smoothing: antialiased;
  user-select: none;
  overflow: hidden;
}


.pi-resize-handle {
  position: absolute;
  left: -4px; top: 0; bottom: 0;
  width: 8px;
  cursor: ew-resize;
  z-index: 10000;
}
.pi-resize-handle::after {
  content: '';
  position: absolute;
  left: 3px; top: 0; bottom: 0;
  width: 2px;
  background: transparent;
  transition: background 100ms;
}
.pi-resize-handle:hover::after { background: var(--bl-accent); }

.pi-titlebar {
  display: flex; align-items: center; gap: 8px;
  height: 32px; padding: 0 10px;
  background: var(--bl-header);
  border-bottom: 1px solid var(--bl-border);
}
.pi-titlebar .pi-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--bl-accent); flex: none;
  box-shadow: 0 0 8px rgba(74,144,226,0.6);
}
.pi-titlebar .pi-title {
  flex: 1;
  font-size: 11px; font-weight: 600; letter-spacing: 0.01em;
  color: var(--bl-text-strong);
}
.pi-titlebar .pi-meta {
  font: 10px var(--bl-mono);
  color: var(--bl-text-dim);
}
.pi-titlebar-btn {
  width: 22px; height: 22px; padding: 0;
  margin-left: 4px;
  background: transparent;
  color: var(--bl-text-dim);
  border: 0;
  border-radius: var(--bl-radius);
  font: 13px/1 var(--bl-font);
  cursor: pointer;
}
.pi-titlebar-btn:hover {
  background: var(--bl-header-hover);
  color: var(--bl-text-strong);
}

.pi-transport {
  display: flex; align-items: center; gap: 1px;
  height: 24px; padding: 0 4px;
  background: #1f1f1f;
  border-bottom: 1px solid var(--bl-border);
}
.pi-tbtn {
  width: 22px; height: 18px; padding: 0;
  display: inline-flex; align-items: center; justify-content: center;
  background: transparent; color: var(--bl-text);
  border: 0; border-radius: var(--bl-radius);
  font-size: 11px; cursor: pointer;
  transition: background 80ms;
}
.pi-tbtn:hover { background: var(--bl-header-hover); color: var(--bl-text-strong); }
.pi-tbtn:active { background: var(--bl-input); }
.pi-tbtn[data-active="1"] { background: var(--bl-accent); color: #fff; }
.pi-tbtn svg { width: 10px; height: 10px; fill: currentColor; }

.pi-status {
  margin-left: auto;
  font: 9px var(--bl-mono); letter-spacing: 0.08em;
  color: var(--bl-text-dim); padding: 0 6px;
}
.pi-status[data-state="playing"] { color: var(--bl-good); }
.pi-status[data-state="paused"]  { color: var(--bl-warn); }
.pi-status[data-state="stopped"] { color: var(--bl-bad); }

.pi-body {
  flex: 1;
  overflow-y: auto; overflow-x: hidden;
  background: var(--bl-bg);
  padding: 3px;
  display: flex; flex-direction: column; gap: 3px;
}
.pi-body::-webkit-scrollbar { width: 10px; }
.pi-body::-webkit-scrollbar-track {
  background: rgba(0,0,0,0.25);
}
.pi-body::-webkit-scrollbar-thumb {
  background: #555;
  border: 2px solid var(--bl-bg);
  border-radius: 5px;
  min-height: 32px;
}
.pi-body::-webkit-scrollbar-thumb:hover { background: #777; }

.pi-footer {
  display: flex; gap: 4px;
  padding: 4px;
  background: #1f1f1f;
  border-top: 1px solid var(--bl-border);
}
.pi-add {
  flex: 1; height: 20px;
  display: inline-flex; align-items: center; justify-content: center; gap: 5px;
  background: var(--bl-header); color: var(--bl-text-strong);
  border: 1px solid var(--bl-border); border-radius: var(--bl-radius);
  font: 10px/1 var(--bl-font); font-weight: 600;
  letter-spacing: 0.02em;
  cursor: pointer;
}
.pi-add:hover { background: var(--bl-header-hover); border-color: var(--bl-accent); }
.pi-add svg { width: 9px; height: 9px; fill: currentColor; }




.pi-group {
  background: var(--bl-bg);
  border: 1px solid var(--bl-border);
  border-radius: var(--bl-radius);

}
.pi-group[data-section="system"]   { --pi-accent: 106, 138, 168; }
.pi-group[data-section="spawn"]    { --pi-accent: 60, 158, 138; }
.pi-group[data-section="particle"] { --pi-accent: 204, 130, 70; }

.pi-group-header {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex; align-items: center; gap: 6px;
  height: 18px;
  padding: 0 8px 0 10px;
  background: var(--bl-header);
  border-bottom: 1px solid var(--bl-border);
  border-radius: var(--bl-radius) var(--bl-radius) 0 0;
  cursor: pointer;
  user-select: none;
  box-shadow: 0 1px 3px rgba(0,0,0,0.25);
}
.pi-group-header:hover {
  background: var(--bl-header-hover);
}
.pi-group-header::before {
  content: '';
  position: absolute; left: 0; top: 0; bottom: 0;
  width: 3px;
  background: rgb(var(--pi-accent));
}
.pi-group-chev {
  width: 6px; height: 6px;
  background: rgb(var(--pi-accent));
  clip-path: polygon(0 0, 100% 50%, 0 100%);
  transition: transform 120ms ease;
  flex: none;
}
.pi-group.is-expanded > .pi-group-header .pi-group-chev {
  transform: rotate(90deg);
}
.pi-group-label {
  flex: 1;
  font: 9px var(--bl-font);
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgb(var(--pi-accent));
}
.pi-group-count {
  font: 9px var(--bl-mono);
  color: var(--bl-text-dim);
  background: rgba(0, 0, 0, 0.35);
  padding: 0 5px;
  height: 12px;
  line-height: 12px;
  border-radius: 6px;
  min-width: 12px;
  text-align: center;
  flex: none;
}
.pi-group-body {
  padding: 2px;
  background: rgba(var(--pi-accent), 0.03);
  display: flex; flex-direction: column; gap: 1px;
  border-radius: 0 0 var(--bl-radius) var(--bl-radius);
}
.pi-group:not(.is-expanded) > .pi-group-body { display: none; }



.pi-panel {
  background: var(--bl-card);
  border: 1px solid var(--bl-border);
  border-radius: var(--bl-radius);
  overflow: hidden;
}
.pi-panel.pi-subpanel {
  margin: 3px 4px 5px;
  background: #202020;
  border-color: rgba(255,255,255,0.1);
}

.pi-panel-header {
  position: relative;
  display: flex; align-items: center; gap: 5px;
  height: 20px; padding: 0 5px 0 4px;
  background: var(--bl-header);
  cursor: pointer;
  user-select: none;
  border-bottom: 1px solid var(--bl-border);
}
.pi-panel-header:hover { background: var(--bl-header-hover); }
.pi-panel-header .pi-chev {
  width: 6px; height: 6px;
  background: var(--bl-text-dim);
  clip-path: polygon(0 0, 100% 50%, 0 100%);
  transition: transform 120ms ease;
  flex: none;
}
.pi-panel.is-expanded > .pi-panel-header .pi-chev {
  transform: rotate(90deg);
}
.pi-panel-header .pi-icon {
  width: 11px; height: 11px; color: var(--bl-text-strong);
  flex: none;
}
.pi-panel-header .pi-icon svg { width: 100%; height: 100%; fill: currentColor; }
.pi-panel-header .pi-name {
  flex: 1;
  font-size: 11px; font-weight: 600;
  color: var(--bl-text-strong);
  letter-spacing: 0.01em;
}
.pi-panel.is-disabled > .pi-panel-header .pi-name,
.pi-panel.is-disabled > .pi-panel-header .pi-icon {
  color: var(--bl-text-faint);
}
.pi-panel-toggle {
  width: 13px; height: 13px;
  border: 1px solid var(--bl-border); border-radius: 2px;
  background: var(--bl-input);
  display: inline-flex; align-items: center; justify-content: center;
  cursor: pointer;
  color: #fff; font-size: 10px; line-height: 1;
  flex: none;
}
.pi-panel-toggle:hover { border-color: var(--bl-accent); }
.pi-panel-toggle[data-on="1"] {
  background: var(--bl-accent); border-color: var(--bl-accent);
}
.pi-panel-toggle svg { width: 8px; height: 8px; }
.pi-panel-body {
  padding: 1px 0;
  background: var(--bl-card);
}
.pi-panel:not(.is-expanded) > .pi-panel-body { display: none; }
.pi-panel.is-disabled > .pi-panel-body { opacity: 0.45; pointer-events: none; }



.pi-row {
  display: flex; align-items: center; gap: 6px;
  min-height: var(--bl-row-h);
  padding: 0 6px;
}
.pi-row:hover { background: var(--bl-card-2); }
.pi-row-label {
  width: 76px; flex: none;
  position: relative;
  font-size: 11px; color: var(--bl-text-dim);
  text-align: right;
  padding-right: 2px;
  line-height: 16px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pi-row-label.is-scrubbable,
.pi-axis-field span.is-scrubbable {
  cursor: ew-resize;
  user-select: none;
}
.pi-row-label.is-scrubbable:hover,
.pi-row-label.is-scrubbing,
.pi-axis-field span.is-scrubbable:hover,
.pi-axis-field span.is-scrubbing {
  color: var(--bl-accent-hi);
}
.pi-row-label.is-scrubbable::before,
.pi-axis-field span.is-scrubbable::before {
  content: "<>";
  display: inline-block;
  width: 0;
  margin-right: 0;
  opacity: 0;
  color: var(--bl-accent-hi);
  font: 8px var(--bl-mono);
  transform: translateX(-2px);
  transition: opacity 0.08s ease, width 0.08s ease, margin-right 0.08s ease;
}
.pi-row-label.is-scrubbable:hover::before,
.pi-row-label.is-scrubbing::before,
.pi-axis-field span.is-scrubbable:hover::before,
.pi-axis-field span.is-scrubbing::before {
  width: 12px;
  margin-right: 3px;
  opacity: 1;
}
.pi-is-scrubbing {
  cursor: ew-resize !important;
  user-select: none !important;
}
.pi-row-control {
  flex: 1; min-width: 0;
  display: flex; align-items: center; gap: 3px;
}

.pi-divider {
  height: 1px;
  margin: 1px 6px;
  background: var(--bl-divider);
}




.pi-slider {
  position: relative;
  flex: 1; min-width: 0;
  height: var(--bl-input-h);
  background: var(--bl-input);
  border: 1px solid var(--bl-border);
  border-radius: var(--bl-radius);
  overflow: hidden;
  cursor: ew-resize;
  user-select: none;
}
.pi-slider:hover { background: var(--bl-input-hover); }
.pi-slider-fill {
  position: absolute; left: 0; top: 0; bottom: 0;
  background: var(--bl-input-fill);
  pointer-events: none;
}
.pi-slider:hover .pi-slider-fill { background: var(--bl-input-fill-h); }
.pi-slider-text {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: flex-end;
  padding: 0 6px;
  font: 10px var(--bl-mono);
  color: var(--bl-text-strong);
  pointer-events: none;
}
.pi-slider input.pi-slider-edit {
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  background: var(--bl-input-focus); color: var(--bl-text-strong);
  border: 0; outline: 1px solid var(--bl-accent); outline-offset: -1px;
  font: 10px var(--bl-mono);
  text-align: right;
  padding: 0 6px;
}


.pi-number {
  flex: 1; min-width: 0;
  height: var(--bl-input-h);
  background: var(--bl-input);
  color: var(--bl-text-strong);
  border: 1px solid var(--bl-border);
  border-radius: var(--bl-radius);
  padding: 0 6px;
  font: 10px var(--bl-mono);
  text-align: right;
  outline: 0;
  -moz-appearance: textfield;
}
.pi-number::-webkit-outer-spin-button, .pi-number::-webkit-inner-spin-button {
  -webkit-appearance: none; margin: 0;
}
.pi-number:hover { background: var(--bl-input-hover); }
.pi-number:focus { background: var(--bl-input-focus); outline: 1px solid var(--bl-accent); outline-offset: -1px; }


.pi-toggle {
  width: 13px; height: 13px;
  background: var(--bl-input);
  border: 1px solid var(--bl-border);
  border-radius: 2px;
  display: inline-flex; align-items: center; justify-content: center;
  cursor: pointer;
  color: #fff;
  flex: none;
}
.pi-toggle:hover { border-color: var(--bl-accent); }
.pi-toggle[data-on="1"] { background: var(--bl-accent); border-color: var(--bl-accent); }
.pi-toggle svg { width: 8px; height: 8px; fill: currentColor; display: none; }
.pi-toggle[data-on="1"] svg { display: block; }


.pi-dropdown {
  position: relative;
  flex: 1; min-width: 0;
  height: var(--bl-input-h);
  background: var(--bl-input);
  border: 1px solid var(--bl-border);
  border-radius: var(--bl-radius);
  display: flex; align-items: center;
  padding: 0 16px 0 6px;
  font: 10px var(--bl-font);
  color: var(--bl-text-strong);
  cursor: pointer;
  user-select: none;
}
.pi-dropdown:hover { background: var(--bl-input-hover); }
.pi-dropdown::after {
  content: '';
  position: absolute; right: 5px; top: 50%;
  width: 6px; height: 4px;
  background: var(--bl-text-dim);
  clip-path: polygon(0 0, 100% 0, 50% 100%);
  transform: translateY(-50%);
}


.pi-mini-dropdown {
  position: relative;
  height: var(--bl-input-h);
  min-width: 38px;
  background: var(--bl-input);
  border: 1px solid var(--bl-border);
  border-radius: var(--bl-radius);
  padding: 0 12px 0 5px;
  font: 9px var(--bl-font);
  color: var(--bl-text-dim);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  display: inline-flex; align-items: center;
  cursor: pointer;
  flex: none;
}
.pi-mini-dropdown:hover { background: var(--bl-input-hover); color: var(--bl-text-strong); }
.pi-mini-dropdown::after {
  content: '';
  position: absolute; right: 4px; top: 50%;
  width: 5px; height: 3px;
  background: var(--bl-text-dim);
  clip-path: polygon(0 0, 100% 0, 50% 100%);
  transform: translateY(-50%);
}


.pi-swatch {
  position: relative;
  width: 22px; height: 14px;
  border: 1px solid var(--bl-border);
  border-radius: 2px;
  cursor: pointer;
  flex: none;
  background-image: var(--bl-checker);
  background-size: 8px 8px;
  overflow: hidden;
}
.pi-swatch-fill { position: absolute; inset: 0; }


.pi-canvas {
  background: var(--bl-input);
  border: 1px solid var(--bl-border);
  border-radius: var(--bl-radius);
  display: block;
}

.pi-strip-wrap { position: relative; }
.pi-stop {
  position: absolute; width: 10px; height: 10px;
  transform: translateX(-5px) translateY(-3px);
  border: 1px solid #fff; border-radius: 1px;
  cursor: pointer;
  box-shadow: 0 0 0 1px rgba(0,0,0,0.7);
}
.pi-stop:hover { z-index: 1; transform: translateX(-5px) translateY(-3px) scale(1.2); }
.pi-strip-row { cursor: crosshair; }
.pi-strip-row:hover { background: rgba(255,255,255,0.04); }
.pi-stop.is-selected {
  border-color: var(--bl-accent);
  box-shadow: 0 0 0 2px rgba(74,144,226,0.5), 0 0 0 3px rgba(0,0,0,0.7);
  z-index: 2;
}


.pi-grad-strip-outer {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column;
}
.pi-grad-strip-wrap {
  padding: 18px 0;
}


.pi-strip-divider {
  position: absolute;
  left: 0; right: 0;
  top: 50%;
  height: 0;
  border-top: 1px dashed rgba(255,255,255,0.45);
  pointer-events: none;
  z-index: 1;
  transform: translateY(-0.5px);
}

.pi-strip-zone-label {
  position: absolute;
  font: 9px var(--bl-font);
  font-weight: 700;
  letter-spacing: 0.18em;
  color: #fff;
  background: rgba(0,0,0,0.6);
  padding: 2px 6px;
  border-radius: 2px;
  pointer-events: none;
  z-index: 2;
  user-select: none;
}
.pi-strip-zone-label.is-alpha { top: 4px; left: 6px; }
.pi-strip-zone-label.is-color { bottom: 4px; left: 6px; }
.pi-grad-stop-editor {
  background: var(--bl-input);
  border: 1px solid var(--bl-border);
  border-radius: var(--bl-radius);
  padding: 12px 14px;
  display: flex; flex-direction: column;
  gap: 8px;
  min-height: 42px;
  justify-content: center;
}


.pi-grad-sep {
  height: 1px;
  background: var(--bl-border);
  margin: 22px 0 12px;
}
.pi-grad-stop-editor.is-empty {
  text-align: center;
}
.pi-grad-edit-hint {
  font: 10px var(--bl-font);
  color: var(--bl-text-faint);
}
.pi-grad-edit-row {
  display: flex; align-items: center;
  gap: 10px;
  min-height: 22px;
}
.pi-grad-edit-lbl {
  width: 56px; flex: none;
  font: 11px var(--bl-font);
  color: var(--bl-text-dim);
  text-align: right;
}

.pi-grad-edit-row > .pi-swatch {
  width: 36px;
  height: 22px;
}
.pi-grad-edit-row > .pi-swatch {
  flex: none;
}
.pi-grad-edit-row > .pi-slider,
.pi-grad-edit-row > .pi-number {
  flex: 1;
}


.pi-pair {
  display: flex; align-items: center; gap: 4px;
  flex: 1; min-width: 0;
}
.pi-pair-sep {
  color: var(--bl-text-faint);
  font: 11px var(--bl-mono);
  user-select: none;
  flex: none;
}


.pi-stack {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column; gap: 2px;
}



.pi-cpicker {
  position: fixed;
  width: 220px;
  padding: 8px;
  background: var(--bl-card);
  border: 1px solid var(--bl-border);
  border-radius: var(--bl-radius);
  box-shadow: 0 10px 28px rgba(0,0,0,0.6);
  z-index: 10000;
  display: flex; flex-direction: column; gap: 6px;
}
.pi-cpicker-sv {
  position: relative;
  width: 100%;
  height: 140px;
  border: 1px solid var(--bl-border);
  border-radius: var(--bl-radius);
  cursor: crosshair;
  overflow: hidden;
}
.pi-cpicker-hue {
  position: relative;
  height: 12px;
  border: 1px solid var(--bl-border);
  border-radius: var(--bl-radius);
  cursor: ew-resize;
  background: linear-gradient(to right,
    hsl(0,100%,50%), hsl(60,100%,50%), hsl(120,100%,50%),
    hsl(180,100%,50%), hsl(240,100%,50%), hsl(300,100%,50%), hsl(360,100%,50%));
}
.pi-cpicker-alpha {
  position: relative;
  height: 12px;
  border: 1px solid var(--bl-border);
  border-radius: var(--bl-radius);
  cursor: ew-resize;
  overflow: hidden;
  background-image: var(--bl-checker);
  background-size: 8px 8px;
}
.pi-cpicker-alpha-fill {
  position: absolute; inset: 0;
  pointer-events: none;
}
.pi-cpicker-handle {
  position: absolute;
  pointer-events: none;
}
.pi-cpicker-handle-sv {
  width: 12px; height: 12px;
  border: 2px solid #fff;
  border-radius: 50%;
  box-shadow: 0 0 0 1px rgba(0,0,0,0.7);
  transform: translate(-50%, -50%);
}
.pi-cpicker-handle-strip {
  top: 50%;
  width: 4px; height: 18px;
  border: 1px solid #fff;
  border-radius: 2px;
  background: rgba(0,0,0,0.4);
  box-shadow: 0 0 0 1px rgba(0,0,0,0.6);
  transform: translate(-50%, -50%);
}
.pi-cpicker-inputs {
  display: flex; align-items: center; gap: 4px;
}
.pi-cpicker-hex {
  flex: 1; min-width: 0;
  height: 22px;
  background: var(--bl-input);
  color: var(--bl-text-strong);
  border: 1px solid var(--bl-border);
  border-radius: var(--bl-radius);
  font: 11px var(--bl-mono);
  text-align: center;
  text-transform: uppercase;
  padding: 0 6px;
  outline: 0;
}
.pi-cpicker-hex:focus { outline: 1px solid var(--bl-accent); outline-offset: -1px; }
.pi-cpicker-anum {
  width: 54px;
  height: 22px;
  background: var(--bl-input);
  color: var(--bl-text-strong);
  border: 1px solid var(--bl-border);
  border-radius: var(--bl-radius);
  padding: 0 6px;
  font: 11px var(--bl-mono);
  text-align: right;
  outline: 0;
  -moz-appearance: textfield;
}
.pi-cpicker-anum::-webkit-outer-spin-button,
.pi-cpicker-anum::-webkit-inner-spin-button {
  -webkit-appearance: none; margin: 0;
}
.pi-cpicker-anum:focus { outline: 1px solid var(--bl-accent); outline-offset: -1px; }


.pi-vpopup {
  position: fixed;
  width: 180px;
  padding: 8px;
  background: var(--bl-card);
  border: 1px solid var(--bl-border);
  border-radius: var(--bl-radius);
  box-shadow: 0 10px 28px rgba(0,0,0,0.6);
  z-index: 10000;
  display: flex; flex-direction: column; gap: 6px;
}
.pi-vpopup-label {
  font: 9px var(--bl-font);
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--bl-text-dim);
}



.pi-burst-head .pi-row-label {
  font-weight: 600;
  color: var(--bl-text);
}
.pi-btn-mini {
  height: var(--bl-input-h);
  background: var(--bl-input);
  color: var(--bl-text);
  border: 1px solid var(--bl-border);
  border-radius: var(--bl-radius);
  padding: 0 6px;
  font: 10px var(--bl-font);
  cursor: pointer;
}
.pi-btn-mini:hover {
  background: var(--bl-input-hover);
  color: var(--bl-text-strong);
  border-color: var(--bl-accent);
}
.pi-segmented {
  width: 100%;
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(54px, 1fr));
  gap: 3px;
  padding: 2px;
  background: #101010;
  border: 1px solid var(--bl-border);
  border-radius: var(--bl-radius-lg);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.035);
}
.pi-segmented button {
  height: 20px;
  min-width: 0;
  padding: 0 5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: var(--bl-input);
  color: var(--bl-text);
  border: 1px solid #050505;
  border-radius: var(--bl-radius);
  font: 10px var(--bl-font);
  cursor: pointer;
  box-shadow: none;
}
.pi-segmented button:hover {
  background: var(--bl-input-hover);
  color: var(--bl-text-strong);
  border-color: var(--bl-accent);
}
.pi-segmented button[data-active="1"] {
  background: #24466d;
  color: var(--bl-text-strong);
  border-color: rgba(116, 174, 242, 0.9);
  box-shadow: none;
}
.pi-number-fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(70px, 1fr));
  gap: 4px;
  width: 100%;
  min-width: 0;
}
.pi-axis-field {
  display: flex;
  align-items: center;
  gap: 3px;
  min-width: 0;
}
.pi-axis-field span {
  flex: none;
  width: 10px;
  color: var(--bl-text-dim);
  font: 10px var(--bl-font);
  text-align: center;
}
.pi-axis-field span.is-scrubbable:hover,
.pi-axis-field span.is-scrubbing {
  width: 25px;
}
.pi-axis-field .pi-number {
  width: 100%;
  padding: 0 4px;
}
.pi-hint {
  color: var(--bl-text-dim);
  font: 10px var(--bl-font);
}
.pi-btn-del {
  width: var(--bl-input-h);
  padding: 0;
  font: 12px/1 var(--bl-font);
  flex: none;
}
.pi-btn-del:hover {
  background: var(--bl-bad);
  border-color: var(--bl-bad);
  color: #fff;
}
.pi-burst-ctrl {
  display: flex;
  align-items: center;
  gap: 6px;
}
.pi-burst-field {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
}
.pi-burst-cap {
  font: 9px var(--bl-mono);
  color: var(--bl-text-faint);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  flex: none;
}
.pi-burst-hint {
  font: 10px var(--bl-font);
  color: var(--bl-text-faint);
  font-style: italic;
}



.pi-image-upload {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
}
.pi-image-pick {
  flex: 1;
  height: var(--bl-input-h);
  background: var(--bl-input);
  color: var(--bl-text);
  border: 1px solid var(--bl-border);
  border-radius: var(--bl-radius);
  padding: 0 6px;
  font: 10px var(--bl-font);
  cursor: pointer;
  text-align: left;
}
.pi-image-pick:hover {
  background: var(--bl-input-hover);
  color: var(--bl-text-strong);
  border-color: var(--bl-accent);
}
.pi-image-thumb {
  width: 22px;
  height: var(--bl-input-h);
  object-fit: cover;
  background-image: var(--bl-checker);
  background-size: 6px 6px;
  border: 1px solid var(--bl-border);
  border-radius: var(--bl-radius);
  flex: none;
}
.pi-image-name {
  flex: 1;
  min-width: 0;
  font: 10px var(--bl-mono);
  color: var(--bl-text-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pi-image-clear {
  width: var(--bl-input-h);
  height: var(--bl-input-h);
  background: var(--bl-input);
  color: var(--bl-text-dim);
  border: 1px solid var(--bl-border);
  border-radius: var(--bl-radius);
  padding: 0;
  font: 12px/1 var(--bl-font);
  cursor: pointer;
  flex: none;
}
.pi-image-clear:hover {
  background: var(--bl-bad);
  color: #fff;
  border-color: var(--bl-bad);
}



.pi-modal-backdrop {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.45);
  z-index: 9999;
}
.pi-modal {
  position: fixed;
  background: var(--bl-card);
  border: 1px solid var(--bl-border);
  border-radius: var(--bl-radius-lg);
  box-shadow: 0 16px 48px rgba(0,0,0,0.8);
  z-index: 10000;
  font: var(--bl-fs)/1.4 var(--bl-font);
  color: var(--bl-text);
  -webkit-font-smoothing: antialiased;
  user-select: none;
}
.pi-modal-titlebar {
  display: flex; align-items: center;
  height: 30px;
  padding: 0 4px 0 12px;
  background: var(--bl-header);
  border-bottom: 1px solid var(--bl-border);
  border-radius: var(--bl-radius-lg) var(--bl-radius-lg) 0 0;
  cursor: grab;
}
.pi-modal-titlebar:active { cursor: grabbing; }
.pi-modal-title {
  flex: 1;
  font: 11px var(--bl-font);
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--bl-text-strong);
}
.pi-modal-close {
  width: 22px; height: 22px;
  background: transparent;
  color: var(--bl-text-dim);
  border: 0; border-radius: var(--bl-radius);
  font: 16px/1 var(--bl-font);
  cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
}
.pi-modal-close:hover {
  background: var(--bl-bad);
  color: #fff;
}
.pi-modal-body {
  padding: 14px;
}
.pi-grad-modal { width: 520px; }
.pi-grad-modal .pi-modal-body { padding: 18px 22px 22px; }


.pi-grad-mode-row {
  display: flex; align-items: center;
  gap: 8px;
  margin-bottom: 14px;
}
.pi-grad-mode-label {
  width: 56px; flex: none;
  font: 10px var(--bl-font);
  color: var(--bl-text-dim);
  text-align: right;
}
.pi-grad-mode-row .pi-dropdown { flex: 1; }

.pi-grad-body {
  display: flex; flex-direction: column;
  gap: 16px;
}
.pi-grad-strip-label {
  font: 9px var(--bl-font);
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--bl-text-dim);
  margin-bottom: 4px;
}


.pi-grad-preview {
  flex: 1; min-width: 0;
  display: block;
}
.pi-grad-preview canvas {
  display: block;
  border: 1px solid var(--bl-border);
  border-radius: var(--bl-radius);
}
.pi-grad-preview:hover canvas {
  border-color: var(--bl-accent);
}



.pi-menu {
  position: fixed;
  background: var(--bl-card);
  border: 1px solid var(--bl-border);
  border-radius: var(--bl-radius);
  padding: 4px 0;
  min-width: 200px;
  box-shadow: 0 10px 28px rgba(0,0,0,0.6);
  z-index: 10000;
}
.pi-menu-item {
  display: flex; align-items: center; gap: 8px;
  height: 24px; padding: 0 10px;
  font: 11px var(--bl-font); color: var(--bl-text);
  cursor: pointer;
}
.pi-menu-item:hover { background: var(--bl-accent); color: #fff; }
.pi-menu-item[aria-disabled="true"] {
  color: var(--bl-text-faint); cursor: default;
}
.pi-menu-item[aria-disabled="true"]:hover { background: transparent; color: var(--bl-text-faint); }
.pi-menu-item .pi-menu-icon { width: 12px; height: 12px; flex: none; }
.pi-menu-item .pi-menu-icon svg { width: 100%; height: 100%; fill: currentColor; }
.pi-menu-item .pi-menu-spacer { flex: 1; }
.pi-menu-item .pi-menu-tag { font: 9px var(--bl-mono); color: var(--bl-text-faint); }
.pi-menu-item .pi-menu-shortcut { font: 10px var(--bl-mono); color: var(--bl-text-faint); letter-spacing: 0.04em; }
.pi-menu-item:hover .pi-menu-shortcut { color: rgba(255,255,255,0.7); }
.pi-menu-sep { height: 1px; margin: 4px 0; background: var(--bl-divider); }
.pi-backdrop { position: fixed; inset: 0; z-index: 9999; background: transparent; }



:root {
  --ed-panel:      #1f1f1f;
  --ed-frame:      #0d0d0d;
  --ed-divider:    #111;
  --ed-divider-2:  #2a2a2a;
  --ed-row-h:      #242424;
  --ed-row-sel-bg: rgba(74, 144, 226, 0.18);
  --ed-text:       #c4c4c4;
  --ed-text-dim:   #888;
  --ed-text-faint: #5c5c5c;
  --ed-text-strong:#e8e8e8;
  --ed-accent:     var(--bl-accent);
}


html, body { background: var(--ed-frame); margin: 0; padding: 0; height: 100%; overflow: hidden; }
body { color: var(--ed-text); font: var(--bl-fs)/1.4 var(--bl-font); -webkit-font-smoothing: antialiased; user-select: none; }

.ed-root {
  position: fixed; inset: 0;
  display: grid;
  grid-template-columns: 1fr auto auto;
  background: var(--ed-frame);
  color: var(--ed-text);
  font: var(--bl-fs)/1.4 var(--bl-font);
}

.ed-viewport {
  position: relative;
  background: #0a0b0d;
  min-width: 0; min-height: 0;
  overflow: hidden;
}
.ed-viewport-transport {
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 35;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  background: rgba(24, 24, 24, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: var(--bl-radius);
  box-shadow: 0 8px 24px rgba(0,0,0,0.35);
  backdrop-filter: blur(8px);
}
.ed-transport-btn {
  width: 26px;
  height: 24px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--bl-input);
  color: var(--bl-text-dim);
  border: 1px solid #070707;
  border-radius: var(--bl-radius);
  cursor: pointer;
  box-shadow: none;
}
.ed-transport-btn:hover {
  color: var(--bl-text-strong);
  border-color: rgba(74, 144, 226, 0.55);
}
.ed-transport-btn[data-active="1"] {
  color: #fff;
  background: #2e6fae;
  border-color: rgba(116, 174, 242, 0.9);
}
.ed-transport-btn svg {
  width: 12px;
  height: 12px;
}
.ed-transport-time {
  min-width: 84px;
  padding: 0 4px 0 6px;
  color: var(--bl-text-dim);
  font: 10px/24px var(--bl-mono);
  text-align: right;
}
.ed-transport-time[data-state="playing"] { color: var(--bl-good); }
.ed-transport-time[data-state="paused"] { color: var(--bl-warn); }
.ed-transport-time[data-state="stopped"] { color: var(--bl-text-faint); }
.ed-viewport-tools {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 35;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  background: rgba(24, 24, 24, 0.86);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: var(--bl-radius);
  box-shadow: 0 8px 24px rgba(0,0,0,0.35);
  backdrop-filter: blur(8px);
}
.ed-viewport-toggle {
  width: 26px;
  height: 24px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--bl-input);
  color: var(--bl-text-dim);
  border: 1px solid #070707;
  border-radius: var(--bl-radius);
  cursor: pointer;
  box-shadow: none;
}
.ed-viewport-toggle:hover {
  color: var(--bl-text-strong);
  border-color: rgba(74, 144, 226, 0.55);
}
.ed-viewport-toggle[data-active="1"] {
  color: var(--bl-accent-hi);
  background: #24466d;
  border-color: rgba(116, 174, 242, 0.9);
}
.ed-viewport-toggle svg {
  width: 14px;
  height: 14px;
}


.ed-split-v {
  width: 4px;
  background: var(--ed-divider);
  cursor: ew-resize;
  flex: none;
  position: relative;
}
.ed-split-v::after {
  content: '';
  position: absolute; left: 50%; top: 50%;
  transform: translate(-50%, -50%);
  width: 1px; height: 28px;
  background: var(--ed-text-faint);
  opacity: 0;
  transition: opacity 120ms;
}
.ed-split-v:hover { background: var(--ed-accent); }
.ed-split-v:hover::after { opacity: 1; background: #fff; }


.ed-right {
  display: flex; flex-direction: column;
  background: var(--ed-panel);
  min-width: 260px; max-width: 720px;
  min-height: 0;
}
.ed-pane {
  display: flex; flex-direction: column;
  min-height: 0;
  background: var(--ed-panel);
}
.ed-pane-inspector { flex: 1; }
.ed-pane-header {
  display: flex; align-items: center;
  height: 20px;
  padding: 0 4px 0 8px;
  background: var(--ed-panel);
  border-bottom: 1px solid var(--ed-divider);
  flex: none;
}
.ed-pane-title {
  font-size: 10px; font-weight: 700;
  color: var(--ed-text-strong);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  flex: 1;
}
.ed-pane-body {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
}
.ed-pane-body::-webkit-scrollbar { width: 10px; }
.ed-pane-body::-webkit-scrollbar-track { background: rgba(0,0,0,0.3); }
.ed-pane-body::-webkit-scrollbar-thumb {
  background: #444;
  border: 2px solid var(--ed-panel);
  border-radius: 5px;
  min-height: 32px;
}
.ed-pane-body::-webkit-scrollbar-thumb:hover { background: #666; }



.ed-insp-body {
  overflow: hidden;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.ed-right-outliner {
  flex: 0 0 260px;
  min-height: 180px;
  max-height: 42%;
  display: flex;
  flex-direction: column;
  border-bottom: 1px solid var(--ed-divider);
}
.ed-right-outliner .ef-root {
  flex: 1 1 auto;
  height: 100%;
  min-height: 0;
  max-height: none;
  border-bottom: 0;
}
.ed-right-inspector {
  min-height: 0;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
}
.pi-root.pi-embedded {
  position: static;
  top: auto; right: auto;
  width: 100% !important;
  max-height: none;
  height: 100%;
  flex: 1;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  background: var(--ed-panel);
}
.pi-root.pi-embedded .pi-titlebar { display: none; }
.pi-root.pi-embedded .pi-transport {
  background: #1c1c1c;
}
.pi-root.pi-embedded .pi-footer { background: #1c1c1c; }
.pi-root.pi-embedded .pi-body { background: var(--ed-panel); }


.ed-unsupported {
  position: fixed; inset: 0;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,0.85);
  z-index: 99999;
  color: var(--ed-text-strong);
  text-align: center;
  padding: 32px;
}
`;
