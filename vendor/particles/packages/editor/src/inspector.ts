import {
  bakeCurveLUT, bakeGradientLUT,
  type MinMaxCurve, type MinMaxGradient,
  type ParticleSystem, type Module,
} from '@particles/core';
import {
  type BuiltinMesh,
  type BuiltinTexture,
  CollisionModule,
  type CollisionResponseMode,
  ColorOverLifetimeModule,
  ColorBySpeedModule,
  OpacityOverLifetimeModule,
  EmissionModule,
  MainModule,
  type MeshFaceSide,
  type MeshDistribution,
  type MeshSource,
  ParticleMaterialModule,
  type RenderFacing,
  type RenderMaterial,
  RendererModule,
  ShapeModule, type ShapeKind,
  SizeOverLifetimeModule,
  type SpriteRenderMode,
  SpriteAnimationModule,
  type FlipbookAnimation,
  type FlipbookPlayback,
  type FlipbookRowMode,
  type FlipbookTimeMode,
  VelocityOverLifetimeModule,
} from '@particles/modules';
import type { ParticleSystemView } from '@particles/gpu';
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CurveEditor } from './curve-editor';
import { makeGradientPreview, openGradientEditor } from './gradient-editor';
import {
  iconPause, iconPlay, iconRestart, iconStop,
  moduleIcon,
} from './icons';
import { loadState, saveState } from './persist';
import { ShapeGizmo } from './shape-gizmo';
import { injectTheme } from './theme';
import {
  bindScrubLabel, el, makeColorSwatch, makeDivider, makeDropdown, makeGroup, makeImageUpload,
  makeNumber, makePanel, makeRow, makeSlider, makeStackRow, makeToggle,
  type Panel,
} from './widgets';

export interface InspectorOptions {
  /** Container to mount the panel into. Defaults to a fixed overlay on document.body. */
  container?: HTMLElement;
  /** Required: the view backing the system, so we can rebuild on structural changes. */
  view: ParticleSystemView;
  title?: string;
  /**
   * If set, the inspector persists all changes to localStorage under this key
   * and restores the saved state on mount.
   */
  persist?: string;
  /**
   * When true the inspector renders inline (fills its container) instead of as
   * a floating fixed panel. Hides the resize handle since the shell provides
   * its own splitters.
   */
  embedded?: boolean;
  /** Hide per-system playback controls when a parent effect owns transport. */
  showTransport?: boolean;
  /** Hide system duration/looping when an emitter clip owns timing. */
  showSystemTiming?: boolean;
  /** Called after a debounced inspector edit has been applied. */
  onChange?: () => void;
  /** Extra source-system panels mounted inside the Spawn group. */
  extraSpawnPanels?: () => InspectorExtraPanel[];
}

export interface InspectorExtraPanel {
  id: string;
  title: string;
  icon?: () => SVGSVGElement;
  enabled?: boolean;
  expanded?: boolean;
  onToggle?: (enabled: boolean) => void;
  build: (body: HTMLElement, refresh: () => void) => void;
}

export function mountInspector(
  system: ParticleSystem,
  opts: InspectorOptions,
): { destroy: () => void } {
  injectTheme();
  const host = opts.container ?? document.body;

  // Restore persisted state BEFORE building the UI so editors capture fresh values.
  if (opts.persist && loadState(system, opts.persist)) {
    opts.view.rebuild();
  }

  // Debounced auto-save. Calls saveState() ~300ms after the last edit so we don't
  // hammer localStorage during slider drags. Also re-auditions one-shot systems
  // so editing values on a non-looping effect snaps the preview to your change.
  const replayIfDone = (): void => {
    if (opts.view.playState === 'playing'
      && !system.config.looping
      && opts.view.hasFinished) {
      opts.view.restart();
    }
  };
  const notify = makeNotifier(
    opts.persist ? () => saveState(system, opts.persist!) : null,
    () => {
      replayIfDone();
      opts.onChange?.();
    },
  );

  // Preview loop: in the editor we want non-looping ("one-shot") systems to
  // keep auditioning so the user can actually see what they're authoring.
  // Without this the system ends after `duration` and the viewport just
  // stares back at an empty scene until you click Restart. A small pause
  // between replays makes it visually distinct from a true looping system.
  const PREVIEW_REPLAY_PAUSE_MS = 500;
  let finishedAt = 0;
  const previewLoop = setInterval(() => {
    if (opts.view.playState !== 'playing'
        || system.config.looping
        || !opts.view.hasFinished) {
      finishedAt = 0;
      return;
    }
    if (finishedAt === 0) finishedAt = performance.now();
    if (performance.now() - finishedAt >= PREVIEW_REPLAY_PAUSE_MS) {
      opts.view.restart();
      finishedAt = 0;
    }
  }, 100);

  // Wireframe gizmo for the Shape module. Lives as a child of the view so it
  // inherits the system's transform automatically. Rebuilt by the Shape panel
  // handlers whenever the shape config changes.
  const shapeMod = system.modules.find((m): m is ShapeModule => m instanceof ShapeModule);
  const shapeGizmo = shapeMod ? new ShapeGizmo(shapeMod) : null;
  if (shapeGizmo) opts.view.add(shapeGizmo);

  // ---- UI state persistence (collapse + width) ----
  // Stored separately from the system state so toggling visibility doesn't
  // bloat the serialized particle config.
  const uiKey = opts.persist ? `${opts.persist}.ui` : null;
  type UiState = { collapsed: string[]; width?: number };
  const uiState: UiState = uiKey
    ? (() => { try { return JSON.parse(localStorage.getItem(uiKey) || '{"collapsed":[]}'); } catch { return { collapsed: [] }; } })()
    : { collapsed: [] };
  const collapsedIds = new Set<string>(uiState.collapsed ?? []);
  const persistUi = (): void => {
    if (!uiKey) return;
    try {
      localStorage.setItem(uiKey, JSON.stringify({
        collapsed: [...collapsedIds],
        width: uiState.width,
      }));
    } catch { /* quota / private mode — ignore */ }
  };
  const isCollapsed = (id: string): boolean => collapsedIds.has(id);
  const setCollapsed = (id: string, c: boolean): void => {
    if (c) collapsedIds.add(id); else collapsedIds.delete(id);
    persistUi();
  };
  const allPanels: Array<{ id: string; panel: { setExpanded: (v: boolean) => void } }> = [];
  const allGroups: Array<{ id: string; group: { setExpanded: (v: boolean) => void } }> = [];
  const moduleDisposers: Array<() => void> = [];

  if (!system.get('material')) {
    system.add(new ParticleMaterialModule());
    sortSystemModules(system);
  }
  const root = el('div', 'pi-root');
  if (opts.embedded) root.classList.add('pi-embedded');
  if (!opts.embedded && uiState.width) root.style.width = `${uiState.width}px`;
  host.appendChild(root);

  // ---- Resize handle on the left edge ----
  // Only floating-mode shows the resize handle; embedded mode is sized by the
  // shell's own split panes.
  let onResizeMove: ((e: MouseEvent) => void) | null = null;
  let onResizeUp: (() => void) | null = null;
  if (!opts.embedded) {
    const resizeHandle = el('div', 'pi-resize-handle');
    root.appendChild(resizeHandle);
    let resizing = false;
    onResizeMove = (e: MouseEvent): void => {
      if (!resizing) return;
      const w = Math.max(320, Math.min(640, window.innerWidth - e.clientX - 8));
      root.style.width = `${w}px`;
      uiState.width = w;
    };
    onResizeUp = (): void => {
      if (!resizing) return;
      resizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      persistUi();
    };
    resizeHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      resizing = true;
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
    });
    window.addEventListener('mousemove', onResizeMove);
    window.addEventListener('mouseup', onResizeUp);
  }

  // Title bar
  const titlebar = el('div', 'pi-titlebar');
  const dot = el('div', 'pi-dot');
  const title = el('div', 'pi-title');
  title.textContent = opts.title ?? 'Particle System';
  const meta = el('div', 'pi-meta');
  meta.textContent = `${system.config.capacity.toLocaleString()} cap`;

  // Collapse-all / expand-all toggle — flips every panel + group at once.
  const collapseAllBtn = document.createElement('button');
  collapseAllBtn.type = 'button';
  collapseAllBtn.className = 'pi-titlebar-btn';
  collapseAllBtn.title = 'Collapse all';
  collapseAllBtn.textContent = '⇕';
  let everythingCollapsed = false;
  collapseAllBtn.onclick = () => {
    everythingCollapsed = !everythingCollapsed;
    const expand = !everythingCollapsed;
    for (const p of allPanels) { p.panel.setExpanded(expand); setCollapsed(p.id, !expand); }
    for (const g of allGroups) { g.group.setExpanded(expand); setCollapsed(g.id, !expand); }
    collapseAllBtn.title = expand ? 'Collapse all' : 'Expand all';
  };

  titlebar.append(dot, title, meta, collapseAllBtn);
  root.appendChild(titlebar);

  // Transport bar
  if (opts.showTransport !== false) root.appendChild(mountTransport(opts.view));

  // Body
  const body = el('div', 'pi-body');
  root.appendChild(body);

  const renderBody = (): void => {
    for (const dispose of moduleDisposers.splice(0)) dispose();
    allPanels.length = 0;
    allGroups.length = 0;
    body.textContent = '';

    // ---- SYSTEM group ----
    const sysGroup = makeGroup({
      label: 'System', section: 'system', count: 1,
      expanded: !isCollapsed('group:system'),
      onExpand: (e) => setCollapsed('group:system', !e),
    });
    body.appendChild(sysGroup.root);
    allGroups.push({ id: 'group:system', group: sysGroup });
    const sysPanel = makePanel({
      title: 'System', icon: () => moduleIcon('main'),
      expanded: !isCollapsed('panel:system'),
      onExpand: (e) => setCollapsed('panel:system', !e),
    });
    sysGroup.body.appendChild(sysPanel.root);
    allPanels.push({ id: 'panel:system', panel: sysPanel });
    buildSystemPanel(sysPanel, system, notify, {
      showTiming: opts.showSystemTiming !== false,
    });

    // ---- PARTICLE group (what the particle IS — defines the visual identity) ----
    const particleMods = orderByCatalog(
      system.modules.filter((m) => {
        if (MODULE_CATEGORY[m.id] !== 'particle') return false;
        if (m.id === 'spriteAnim') return false;
        if (m.id === 'material') return false;
        return true;
      }),
    );
    if (particleMods.length > 0) {
      const particleGroup = makeGroup({
        label: 'Particle', section: 'particle', count: particleMods.length,
        expanded: !isCollapsed('group:particle'),
        onExpand: (e) => setCollapsed('group:particle', !e),
      });
      body.appendChild(particleGroup.root);
      allGroups.push({ id: 'group:particle', group: particleGroup });
      for (const mod of particleMods) {
        moduleDisposers.push(buildModulePanel(particleGroup.body, mod, opts.view, notify, shapeGizmo, system, {
          expanded: !isCollapsed(`panel:${mod.id}`),
          onExpand: (e) => setCollapsed(`panel:${mod.id}`, !e),
          register: (p) => allPanels.push({ id: `panel:${mod.id}`, panel: p }),
        }));
      }
    }

    // ---- SPAWN group (where + when particles are born) ----
    const spawnMods = orderByCatalog(
      system.modules.filter((m) => MODULE_CATEGORY[m.id] === 'spawn'),
    );
    const extraSpawnPanels = opts.extraSpawnPanels?.() ?? [];
    if (spawnMods.length > 0 || extraSpawnPanels.length > 0) {
      const spawnGroup = makeGroup({
        label: 'Spawn', section: 'spawn', count: spawnMods.length + extraSpawnPanels.length,
        expanded: !isCollapsed('group:spawn'),
        onExpand: (e) => setCollapsed('group:spawn', !e),
      });
      body.appendChild(spawnGroup.root);
      allGroups.push({ id: 'group:spawn', group: spawnGroup });
      for (const mod of spawnMods) {
        moduleDisposers.push(buildModulePanel(spawnGroup.body, mod, opts.view, notify, shapeGizmo, system, {
          expanded: !isCollapsed(`panel:${mod.id}`),
          onExpand: (e) => setCollapsed(`panel:${mod.id}`, !e),
          register: (p) => allPanels.push({ id: `panel:${mod.id}`, panel: p }),
        }));
      }
      for (const extra of extraSpawnPanels) {
        const panelId = `panel:extra:${extra.id}`;
        const panel = makePanel({
          title: extra.title,
          icon: extra.icon,
          enabled: extra.enabled,
          expanded: extra.expanded ?? !isCollapsed(panelId),
          onExpand: (e) => setCollapsed(panelId, !e),
          onToggle: extra.onToggle
            ? (enabled) => {
                extra.onToggle?.(enabled);
                opts.onChange?.();
                renderBody();
              }
            : undefined,
        });
        allPanels.push({ id: panelId, panel });
        extra.build(panel.body, renderBody);
        spawnGroup.body.appendChild(panel.root);
      }
    }

    // Anything not yet categorized (defensive — should be empty in practice).
    const orphans = system.modules.filter((m) => !MODULE_CATEGORY[m.id]);
    for (const mod of orphans) {
      moduleDisposers.push(buildModulePanel(body, mod, opts.view, notify, shapeGizmo, system));
    }
  };
  renderBody();

  return {
    destroy: () => {
      clearInterval(previewLoop);
      if (onResizeMove) window.removeEventListener('mousemove', onResizeMove);
      if (onResizeUp) window.removeEventListener('mouseup', onResizeUp);
      for (const d of moduleDisposers) d();
      if (shapeGizmo) {
        opts.view.remove(shapeGizmo);
        shapeGizmo.dispose();
      }
      root.remove();
    },
  };
}

// ----- transport -----

function mountTransport(view: ParticleSystemView): HTMLElement {
  const bar = el('div', 'pi-transport');
  const status = el('span', 'pi-status');

  const refresh = (): void => {
    status.textContent = view.playState.toUpperCase();
    status.dataset.state = view.playState;
    for (const btn of Array.from(bar.querySelectorAll<HTMLButtonElement>('.pi-tbtn[data-mode]'))) {
      btn.dataset.active = btn.dataset.mode === view.playState ? '1' : '0';
    }
  };

  const mk = (
    title: string,
    icon: () => SVGSVGElement,
    onClick: () => void,
    mode?: string,
  ): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pi-tbtn';
    b.title = title;
    if (mode) b.dataset.mode = mode;
    b.appendChild(icon());
    b.onclick = () => { onClick(); refresh(); };
    return b;
  };

  bar.append(
    mk('Play', iconPlay, () => view.play(), 'playing'),
    mk('Pause', iconPause, () => view.pause(), 'paused'),
    mk('Stop — clear & reset', iconStop, () => view.stop(), 'stopped'),
    mk('Restart', iconRestart, () => { view.stop(); view.play(); }),
    status,
  );
  refresh();
  return bar;
}

/** Sort an array of modules to match the AVAILABLE_MODULES catalog order. */
function orderByCatalog<T extends Module>(mods: T[]): T[] {
  const order = new Map(AVAILABLE_MODULES.map((m, i) => [m.id, i]));
  return [...mods].sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
}

function sortSystemModules(system: ParticleSystem): void {
  const ordered = orderByCatalog(system.modules);
  system.modules.splice(0, system.modules.length, ...ordered);
}

/**
 * Returns a `notify` function called by every change handler. Debounces to
 * batch rapid edits (e.g. slider drags) into one save + one post-edit hook.
 */
function makeNotifier(save: (() => void) | null, after: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (timer != null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      save?.();
      after();
    }, 300);
  };
}

type ModuleCategory = 'spawn' | 'particle';

interface ModuleEntry {
  id: string;
  label: string;
  category: ModuleCategory;
  make: () => Module;
}

/**
 * Module catalog grouped by what each module *does*:
 *  - particle: what each particle IS — its visual identity and how it evolves
 *  - spawn: when + where particles come into being
 *
 * The display order inside each group matches this array order, and the
 * groups themselves render Particle-before-Spawn in the inspector.
 */
const AVAILABLE_MODULES: ModuleEntry[] = [
  // ----- PARTICLE -----
  // 'main' stays as the internal id (storage / serialization) but reads as "Particle".
  { id: 'main',       label: 'Particle',             category: 'particle', make: () => new MainModule() },
  { id: 'renderer',   label: 'Renderer',             category: 'particle', make: () => new RendererModule() },
  { id: 'material',   label: 'Material',             category: 'particle', make: () => new ParticleMaterialModule() },
  { id: 'col',        label: 'Color over Lifetime',  category: 'particle', make: () => new ColorOverLifetimeModule() },
  { id: 'cbs',        label: 'Color by Speed',       category: 'particle', make: () => new ColorBySpeedModule() },
  { id: 'opl',        label: 'Opacity over Lifetime',category: 'particle', make: () => new OpacityOverLifetimeModule() },
  { id: 'sol',        label: 'Size over Lifetime',   category: 'particle', make: () => new SizeOverLifetimeModule() },
  { id: 'vol',        label: 'Velocity over Lifetime', category: 'particle', make: () => new VelocityOverLifetimeModule() },
  { id: 'spriteAnim', label: 'Sprite Animation',     category: 'particle', make: () => new SpriteAnimationModule() },
  { id: 'collision',  label: 'Collision',            category: 'particle', make: () => new CollisionModule() },
  // ----- SPAWN -----
  { id: 'emission', label: 'Emission', category: 'spawn',    make: () => new EmissionModule() },
  { id: 'shape',    label: 'Shape',    category: 'spawn',    make: () => new ShapeModule() },
];

const MODULE_CATEGORY: Record<string, ModuleCategory> =
  Object.fromEntries(AVAILABLE_MODULES.map((m) => [m.id, m.category]));

// ----- system panel -----

function buildSystemPanel(
  panel: Panel,
  system: ParticleSystem,
  notify: () => void,
  opts: { showTiming: boolean },
): void {
  if (opts.showTiming) {
    panel.body.append(
      makeRow('Duration',
        makeSlider(system.config.duration, {
          min: 0.1, max: 60, step: 0.1, precision: 1,
          onChange: (v) => { system.config.duration = v; notify(); },
        }),
      ),
      makeRow('Looping',
        makeToggle(system.config.looping, (v) => { system.config.looping = v; notify(); }),
      ),
    );
  }

  panel.body.append(
    makeRow('Time Scale',
      makeSlider(system.config.timeScale, {
        min: 0, max: 4, step: 0.01, precision: 2,
        onChange: (v) => { system.config.timeScale = v; notify(); },
      }),
    ),
    makeRow('Sim Space',
      makeDropdown(
        system.config.simulationSpace,
        [
          { value: 'world', label: 'World' },
          { value: 'local', label: 'Local' },
        ],
        (v) => { system.config.simulationSpace = v; notify(); },
      ),
    ),
  );
}

// ----- module panels -----

const SHAPE_KIND_INDEX: Record<ShapeKind, number> = {
  sphere: 0, hemisphere: 1, cone: 2, box: 3, circle: 4, plane: 5, terrain: 6, torus: 7, mesh: 8,
};

interface PanelStateOpts {
  expanded?: boolean;
  onExpand?: (expanded: boolean) => void;
  register?: (panel: Panel) => void;
}

function buildModulePanel(
  body: HTMLElement,
  mod: Module,
  view: ParticleSystemView,
  notify: () => void,
  shapeGizmo: ShapeGizmo | null,
  system: ParticleSystem,
  state: PanelStateOpts = {},
): () => void {
  const panel = makePanel({
    title: moduleTitle(mod.id),
    icon: () => moduleIcon(mod.id),
    enabled: mod.enabled,
    expanded: state.expanded ?? true,
    onExpand: state.onExpand,
    onToggle: (en) => {
      mod.enabled = en;
      view.rebuild();
      notify();
    },
  });
  state.register?.(panel);
  body.appendChild(panel.root);

  const disposers: Array<() => void> = [];

  /** Patch a single curve LUT in place — far cheaper than full pipeline recompile. */
  const onCurveEdit = (moduleId: string, lutName: string, curve: MinMaxCurve) =>
    (): void => {
      view.backend.patchLUT(moduleId, lutName, bakeCurveLUT(curve));
      notify();
    };
  const onGradEdit = (moduleId: string, lutName: string, grad: MinMaxGradient) =>
    (): void => {
      view.backend.patchLUT(moduleId, lutName, bakeGradientLUT(grad));
      notify();
    };

  const addCurveRow = (label: string, curve: MinMaxCurve, onEdit: () => void): void => {
    const editor = new CurveEditor(curve, { onChange: onEdit });
    disposers.push(() => editor.destroy());
    panel.body.appendChild(makeStackRow(label, [editor.root]));
  };
  const addGradientRow = (label: string, grad: MinMaxGradient, onEdit: () => void): void => {
    // Compact clickable preview in the inspector; click pops the full
    // Unity-style gradient editor in a modal.
    const preview = makeGradientPreview(grad, { width: 200, height: 20 });
    preview.element.onclick = () => {
      openGradientEditor(preview.element, grad, {
        onChange: () => { preview.refresh(); onEdit(); },
      });
    };
    panel.body.appendChild(makeRow(label, preview.element));
  };

  if (mod instanceof MainModule) {
    addCurveRow('Lifetime', mod.config.startLifetime, onCurveEdit('main', 'lifetime', mod.config.startLifetime));
    addCurveRow('Speed',    mod.config.startSpeed,    onCurveEdit('main', 'speed',    mod.config.startSpeed));
    addCurveRow('Size',     mod.config.startSize,     onCurveEdit('main', 'size',     mod.config.startSize));
    addCurveRow('Rotation', mod.config.startRotation, onCurveEdit('main', 'rotation', mod.config.startRotation));
    addGradientRow('Start Color', mod.config.startColor, onGradEdit('main', 'color', mod.config.startColor));
    panel.body.appendChild(makeRow('Infinite Lifetime', makeToggle(mod.config.infiniteLifetime, (value) => {
      mod.config.infiniteLifetime = value;
      view.backend.patchUniform('main', 'infinite', value ? 1 : 0);
      notify();
    })));
    panel.body.appendChild(makeDivider());
    addCurveRow('Gravity',  mod.config.gravityModifier, onCurveEdit('main', 'gravity', mod.config.gravityModifier));
  } else if (mod instanceof EmissionModule) {
    populateEmissionPanel(panel, mod, view, notify);
  } else if (mod instanceof ShapeModule) {
    populateShapePanel(panel, mod, view, notify, shapeGizmo);
  } else if (mod instanceof VelocityOverLifetimeModule) {
    addCurveRow('X', mod.config.x, onCurveEdit('vol', 'x', mod.config.x));
    addCurveRow('Y', mod.config.y, onCurveEdit('vol', 'y', mod.config.y));
    addCurveRow('Z', mod.config.z, onCurveEdit('vol', 'z', mod.config.z));
  } else if (mod instanceof ColorOverLifetimeModule) {
    addGradientRow('Color', mod.config.color, onGradEdit('col', 'grad', mod.config.color));
  } else if (mod instanceof ColorBySpeedModule) {
    addGradientRow('Color', mod.config.color, onGradEdit('cbs', 'grad', mod.config.color));
    panel.body.appendChild(makeRow('Speed Range', makeNumberFields(
      ['Min', 'Max'], mod.config.range,
      (axis, value) => {
        const range: [number, number] = axis === 0 ? [value, mod.config.range[1]] : [mod.config.range[0], value];
        mod.config.range = range;
        view.backend.patchUniform('cbs', 'range', range);
        notify();
      },
      { min: 0, step: 0.05, precision: 2 },
    )));
  } else if (mod instanceof OpacityOverLifetimeModule) {
    addCurveRow('Opacity', mod.config.alpha, onCurveEdit('opl', 'alpha', mod.config.alpha));
  } else if (mod instanceof SizeOverLifetimeModule) {
    addCurveRow('Size', mod.config.size, onCurveEdit('sol', 'size', mod.config.size));
  } else if (mod instanceof ParticleMaterialModule) {
    populateMaterialPanel(panel, mod, view, notify);
  } else if (mod instanceof RendererModule) {
    populateRendererPanel(panel, mod, view, notify, system, addCurveRow);
  } else if (mod instanceof CollisionModule) {
    populateCollisionPanel(panel, mod, view, notify);
  } else if (mod instanceof SpriteAnimationModule) {
    panel.root.remove();
  }

  return () => {
    for (const d of disposers) d();
    panel.root.remove();
  };
}

function populateRendererPanel(
  panel: Panel,
  mod: RendererModule,
  view: ParticleSystemView,
  notify: () => void,
  system: ParticleSystem,
  addCurveRow: (label: string, curve: MinMaxCurve, onEdit: () => void) => void,
): void {
  const apply = (): void => {
    view.backend.applyRendererConfig();
    notify();
  };
  const render = (): void => {
    panel.body.innerHTML = '';
    const mode = mod.config.renderMode;
    const isMesh = mode === 'mesh';
    const isBillboard = mode !== 'mesh' && mode !== 'none';
    const sprite = system.get<SpriteAnimationModule>('spriteAnim');
    const material = system.get<ParticleMaterialModule>('material');

    panel.body.appendChild(makeRow('Render Shape',
      makeSegmented<SpriteRenderMode>(
        mod.config.renderMode,
        [
          { value: 'sprite', label: 'Sprite' },
          { value: 'stretchedSprite', label: 'Stretch' },
          { value: 'horizontalBillboard', label: 'Flat' },
          { value: 'verticalBillboard', label: 'Upright' },
          { value: 'mesh', label: 'Mesh' },
          { value: 'none', label: 'None' },
        ],
        (v) => {
          mod.config.renderMode = v;
          apply();
          render();
        },
      ),
    ));

    if (mode === 'none') return;

    if (mode === 'sprite' || mode === 'stretchedSprite' || mode === 'mesh') {
      panel.body.appendChild(makeRow('Facing',
        makeDropdown<RenderFacing>(
          mod.config.facing,
          [
            { value: 'auto', label: 'Auto' },
            { value: 'camera', label: 'Camera' },
            { value: 'velocity', label: 'Velocity' },
            { value: 'world', label: 'World' },
            { value: 'local', label: 'Local' },
          ],
          (v) => { mod.config.facing = v; apply(); },
        ),
      ));
    }

    if (isMesh) {
      panel.body.appendChild(makeDivider());
      panel.body.appendChild(makeRow('Mesh Source',
        makeSegmented<MeshSource>(
          mod.config.meshSource,
          [
            { value: 'primitive', label: 'Primitive' },
            { value: 'custom', label: 'Custom' },
          ],
          (v) => {
            mod.config.meshSource = v;
            apply();
            render();
          },
        ),
      ));
      if (mod.config.meshSource === 'primitive') {
        panel.body.appendChild(makeRow('Primitive',
          makeDropdown<BuiltinMesh>(
            mod.config.mesh,
            [
              { value: 'cube', label: 'Cube' },
              { value: 'tetrahedron', label: 'Tetrahedron' },
              { value: 'diamond', label: 'Diamond' },
              { value: 'shard', label: 'Shard' },
              { value: 'plane', label: 'Plane' },
            ],
            (v) => { mod.config.mesh = v; apply(); },
          ),
        ));
      } else {
        panel.body.appendChild(makeRow('Custom Mesh',
          makeMeshUpload({
            name: mod.config.customMesh?.name,
            onChange: (asset, texture) => {
              mod.config.customMesh = asset;
              if (texture !== undefined && material) material.config.baseMap = texture;
              apply();
              render();
            },
          }),
        ));
        panel.body.appendChild(makeRow('Variants',
          makeMeshSetEditor(mod, () => {
            apply();
            render();
          }),
        ));
        if (mod.config.meshSlots.length > 0) {
          panel.body.appendChild(makeRow('Distribution',
            makeDropdown<MeshDistribution>(
              mod.config.meshDistribution,
              [
                { value: 'single', label: 'Single' },
                { value: 'uniformRandom', label: 'Random' },
                { value: 'weightedRandom', label: 'Weighted' },
              ],
              (v) => { mod.config.meshDistribution = v; apply(); },
            ),
          ));
        }
      }

      panel.body.appendChild(makeDivider());
      panel.body.appendChild(makeRow('Scale',
        makeVector3Number(
          ['X', 'Y', 'Z'],
          mod.config.meshScale,
          (axis, value) => {
            const next: [number, number, number] = [...mod.config.meshScale];
            next[axis] = Math.max(0.01, value);
            mod.config.meshScale = next;
            apply();
          },
          { min: 0.01, max: 10, step: 0.05, precision: 2 },
        ),
      ));
      panel.body.appendChild(makeRow('Random Rot',
        makeVector3Number(
          ['X', 'Y', 'Z'],
          mod.config.meshRotationJitter,
          (axis, value) => {
            const next: [number, number, number] = [...mod.config.meshRotationJitter];
            next[axis] = Math.max(0, value);
            mod.config.meshRotationJitter = next;
            apply();
          },
          { min: 0, max: Math.PI * 2, step: 0.05, precision: 2 },
        ),
      ));
      panel.body.appendChild(makeRow('Faces',
        makeSegmented<MeshFaceSide>(
          mod.config.meshFaceSide,
          [
            { value: 'front', label: 'Front' },
            { value: 'back', label: 'Back' },
            { value: 'both', label: 'Both' },
          ],
          (v) => {
            mod.config.meshFaceSide = v;
            apply();
          },
        ),
      ));

      if (material) {
        panel.body.appendChild(makeDivider());
        panel.body.appendChild(makeRow('Material',
          makeDropdown<RenderMaterial>(
            material.config.preset,
            [
              { value: 'unlitAlpha', label: 'Unlit Alpha' },
              { value: 'unlitAdditive', label: 'Unlit Additive' },
              { value: 'softSmoke', label: 'Soft Smoke' },
              { value: 'multiply', label: 'Multiply' },
            ],
            (v) => {
              material.config.preset = v;
              applyMaterialPreset(material, v);
              apply();
              render();
            },
          ),
        ));
        panel.body.appendChild(makeRow('Base Map',
          makeImageUpload({
            current: material.config.baseMap,
            onChange: (url) => {
              material.config.baseMap = url;
              apply();
            },
          }),
        ));
        panel.body.appendChild(makeRow('Tint',
          makeColorSwatch(
            () => material.config.tint,
            (c) => { material.config.tint = c; apply(); },
          ),
        ));
      }
    }

    if (isBillboard) {
      panel.body.appendChild(makeDivider());
      panel.body.appendChild(makeRow('Texture',
        makeDropdown<BuiltinTexture>(
          mod.config.texture,
          [
            { value: 'circle', label: 'Soft Circle' },
            { value: 'flame',  label: 'Flame' },
            { value: 'smoke',  label: 'Smoke' },
            { value: 'star',   label: 'Star' },
            { value: 'square', label: 'Square' },
          ],
          (v) => { mod.config.texture = v; apply(); },
        ),
      ));
      panel.body.appendChild(makeRow('Custom',
        makeImageUpload({
          current: mod.config.customTexture,
          onChange: (url) => {
            mod.config.customTexture = url;
            apply();
          },
        }),
      ));
      panel.body.appendChild(makeRow('Flipbook',
        makeToggle(!!sprite?.enabled, (enabled) => {
          let next = system.get<SpriteAnimationModule>('spriteAnim');
          if (!next) {
            next = system.add(new SpriteAnimationModule());
            sortSystemModules(system);
          }
          next.enabled = enabled;
          view.rebuild();
          apply();
          render();
        }),
      ));
      if (sprite?.enabled) {
        panel.body.appendChild(makeRow('Columns',
          makeNumber(sprite.config.cols, {
            min: 1, max: 16, step: 1, precision: 0,
            onChange: (v) => {
              sprite.config.cols = Math.max(1, Math.floor(v));
              apply();
            },
          }),
        ));
        panel.body.appendChild(makeRow('Rows',
          makeNumber(sprite.config.rows, {
            min: 1, max: 16, step: 1, precision: 0,
            onChange: (v) => {
              sprite.config.rows = Math.max(1, Math.floor(v));
              apply();
            },
          }),
        ));
        panel.body.appendChild(makeRow('Sequence',
          makeSegmented<FlipbookAnimation>(sprite.config.animation, [
            { value: 'wholeSheet', label: 'Whole Sheet' },
            { value: 'singleRow', label: 'Single Row' },
          ], (value) => { sprite.config.animation = value; apply(); render(); }),
        ));
        panel.body.appendChild(makeRow('Time Mode',
          makeSegmented<FlipbookTimeMode>(sprite.config.timeMode, [
            { value: 'fps', label: 'FPS' },
            { value: 'lifetime', label: 'Lifetime' },
            { value: 'speed', label: 'Speed' },
          ], (value) => { sprite.config.timeMode = value; apply(); render(); }),
        ));
        panel.body.appendChild(makeRow('Playback',
          makeSegmented<FlipbookPlayback>(sprite.config.playback, [
            { value: 'once', label: 'Once' },
            { value: 'loop', label: 'Loop' },
            { value: 'pingPong', label: 'Ping Pong' },
            { value: 'holdLast', label: 'Hold' },
          ], (value) => { sprite.config.playback = value; apply(); }),
        ));
        if (sprite.config.timeMode === 'fps') {
          panel.body.appendChild(makeRow('FPS', makeNumber(sprite.config.fps, {
            min: 0.01, max: 120, step: 0.1, precision: 1,
            onChange: (value) => { sprite.config.fps = Math.max(0.01, value); apply(); },
          })));
        }
        if (sprite.config.timeMode === 'speed') {
          panel.body.appendChild(makeRow('Speed Range', makeNumberFields(
            ['Min', 'Max'], sprite.config.speedRange,
            (axis, value) => {
              sprite.config.speedRange = axis === 0 ? [value, sprite.config.speedRange[1]] : [sprite.config.speedRange[0], value];
              apply();
            }, { min: 0, step: 0.05, precision: 2 },
          )));
        }
        panel.body.appendChild(makeRow('Start Frame', makeNumber(sprite.config.startFrame, {
          min: 0, step: 1, precision: 0,
          onChange: (value) => { sprite.config.startFrame = Math.max(0, Math.floor(value)); apply(); },
        })));
        panel.body.appendChild(makeRow('Random Start', makeToggle(sprite.config.randomStart, (value) => {
          sprite.config.randomStart = value; apply();
        })));
        if (sprite.config.animation === 'singleRow') {
          panel.body.appendChild(makeRow('Row Mode', makeSegmented<FlipbookRowMode>(sprite.config.rowMode, [
            { value: 'custom', label: 'Custom' }, { value: 'random', label: 'Random' },
          ], (value) => { sprite.config.rowMode = value; apply(); render(); })));
          if (sprite.config.rowMode === 'custom') {
            panel.body.appendChild(makeRow('Row', makeNumber(sprite.config.row, {
              min: 0, max: Math.max(0, sprite.config.rows - 1), step: 1, precision: 0,
              onChange: (value) => { sprite.config.row = Math.max(0, Math.min(sprite.config.rows - 1, Math.floor(value))); apply(); },
            })));
          }
        }
        panel.body.appendChild(makeRow('Cycles',
          makeSlider(sprite.config.cycles, {
            min: 0.1, max: 8, step: 0.1, precision: 1,
            onChange: (v) => { sprite.config.cycles = v; apply(); },
          }),
        ));
        addCurveRow('Frame', sprite.config.frameOverLifetime, () => {
          view.backend.setSpriteFrameLut(bakeCurveLUT(sprite.config.frameOverLifetime));
          notify();
        });
        panel.body.appendChild(makeRow('Atlas',
          makeImageUpload({
            current: sprite.config.customAtlas,
            onChange: (url) => {
              sprite.config.customAtlas = url;
              apply();
            },
          }),
        ));
      }

      if (mode === 'stretchedSprite') {
        panel.body.appendChild(makeDivider());
        panel.body.appendChild(makeRow('Velocity Stretch',
          makeSlider(mod.config.velocityScale, {
            min: 0, max: 1, step: 0.01, precision: 2,
            onChange: (v) => { mod.config.velocityScale = v; apply(); },
          }),
        ));
        panel.body.appendChild(makeRow('Length Scale',
          makeSlider(mod.config.lengthScale, {
            min: 0.1, max: 8, step: 0.05, precision: 2,
            onChange: (v) => { mod.config.lengthScale = v; apply(); },
          }),
        ));
        panel.body.appendChild(makeRow('Follow Velocity',
          makeToggle(mod.config.rotateWithStretch, (v) => {
            mod.config.rotateWithStretch = v;
            apply();
          }),
        ));
      }

      panel.body.appendChild(makeDivider());
      panel.body.appendChild(makeRow('Pivot',
        makeNumberFields(
          ['X', 'Y'],
          mod.config.pivot,
          (axis, value) => {
            mod.config.pivot = axis === 0 ? [value, mod.config.pivot[1]] : [mod.config.pivot[0], value];
            apply();
          },
          { min: -1, max: 1, step: 0.05, precision: 2 },
        ),
      ));
      panel.body.appendChild(makeRow('Flip',
        makeNumberFields(
          ['X', 'Y'],
          mod.config.flip,
          (axis, value) => {
            mod.config.flip = axis === 0 ? [value, mod.config.flip[1]] : [mod.config.flip[0], value];
            apply();
          },
          { min: 0, max: 1, step: 0.01, precision: 2 },
        ),
      ));
    }

  };

  render();
}

function makeSegmented<T extends string>(
  value: T,
  options: Array<{ value: T; label: string }>,
  onChange: (value: T) => void,
): HTMLElement {
  const wrap = el('div', 'pi-segmented');
  for (const option of options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = option.label;
    button.dataset.active = option.value === value ? '1' : '0';
    button.onclick = () => {
      for (const item of wrap.querySelectorAll<HTMLButtonElement>('button')) {
        item.dataset.active = item === button ? '1' : '0';
      }
      onChange(option.value);
    };
    wrap.appendChild(button);
  }
  return wrap;
}

function makeVector3Number(
  labels: [string, string, string],
  values: [number, number, number],
  onChange: (axis: 0 | 1 | 2, value: number) => void,
  opts: { min?: number; max?: number; step?: number; precision?: number },
): HTMLElement {
  return makeNumberFields(labels, values, onChange as (axis: number, value: number) => void, opts);
}

function makeNumberFields(
  labels: readonly string[],
  values: readonly number[],
  onChange: (axis: number, value: number) => void,
  opts: { min?: number; max?: number; step?: number; precision?: number },
): HTMLElement {
  const wrap = el('div', 'pi-number-fields');
  labels.forEach((label, axis) => {
    const field = el('label', 'pi-axis-field');
    const cap = el('span');
    cap.textContent = label;
    const input = makeNumber(values[axis] ?? 0, {
      ...opts,
      onChange: (value) => onChange(axis, value),
    });
    bindScrubLabel(cap, input);
    field.append(cap, input);
    wrap.appendChild(field);
  });
  return wrap;
}

function populateCollisionPanel(
  panel: Panel,
  mod: CollisionModule,
  view: ParticleSystemView,
  notify: () => void,
): void {
  const apply = (): void => {
    view.rebuild();
    notify();
  };
  panel.body.append(
    makeRow('Response',
      makeSegmented<CollisionResponseMode>(
        mod.config.mode,
        [
          { value: 'slide', label: 'Slide' },
          { value: 'bounce', label: 'Bounce' },
          { value: 'stick', label: 'Stick' },
          { value: 'settle', label: 'Settle' },
        ],
        (value) => {
          mod.config.mode = value;
          apply();
        },
      ),
    ),
    makeRow('Radius',
      makeNumber(mod.config.radiusScale, {
        min: 0, max: 2, step: 0.05, precision: 2,
        onChange: (value) => {
          mod.config.radiusScale = Math.max(0, value);
          apply();
        },
      }),
    ),
    makeRow('Strength',
      makeNumber(mod.config.strength, {
        min: 0, max: 1, step: 0.01, precision: 2,
        onChange: (value) => {
          mod.config.strength = Math.max(0, Math.min(1, value));
          apply();
        },
      }),
    ),
  );
}

function populateMaterialPanel(
  panel: Panel,
  mod: ParticleMaterialModule,
  view: ParticleSystemView,
  notify: () => void,
): void {
  const apply = (): void => {
    view.backend.applyRendererConfig();
    notify();
  };
  const render = (): void => {
    panel.body.innerHTML = '';
    panel.body.appendChild(makeRow('Preset',
      makeDropdown<RenderMaterial>(
        mod.config.preset,
        [
          { value: 'unlitAlpha', label: 'Unlit Alpha' },
          { value: 'unlitAdditive', label: 'Unlit Additive' },
          { value: 'softSmoke', label: 'Soft Smoke' },
          { value: 'multiply', label: 'Multiply' },
        ],
        (v) => {
          mod.config.preset = v;
          applyMaterialPreset(mod, v);
          apply();
          render();
        },
      ),
    ));
    panel.body.appendChild(makeRow('Shading',
      makeDropdown(
        mod.config.shading,
        [
          { value: 'unlit', label: 'Unlit' },
          { value: 'lit', label: 'Lit' },
        ],
        (v) => { mod.config.shading = v as 'unlit' | 'lit'; apply(); },
      ),
    ));
    panel.body.appendChild(makeRow('Base Map',
      makeImageUpload({
        current: mod.config.baseMap,
        onChange: (url) => {
          mod.config.baseMap = url;
          apply();
        },
      }),
    ));
    panel.body.appendChild(makeRow('Tint',
      makeColorSwatch(
        () => mod.config.tint,
        (c) => { mod.config.tint = c; apply(); },
      ),
    ));
    panel.body.appendChild(makeRow('Emission',
      makeSlider(mod.config.emissiveStrength, {
        min: 0, max: 4, step: 0.05, precision: 2,
        onChange: (v) => { mod.config.emissiveStrength = v; apply(); },
      }),
    ));
    panel.body.appendChild(makeRow('Alpha Cutoff',
      makeSlider(mod.config.alphaCutoff, {
        min: 0, max: 1, step: 0.01, precision: 2,
        onChange: (v) => { mod.config.alphaCutoff = v; apply(); },
      }),
    ));
    panel.body.appendChild(makeRow('Depth Write',
      makeToggle(mod.config.depthWrite, (v) => { mod.config.depthWrite = v; apply(); }),
    ));
  };
  render();
}

function applyMaterialPreset(mod: ParticleMaterialModule, material: RenderMaterial): void {
  if (material === 'unlitAdditive') {
    mod.config.blendMode = 'additive';
    mod.config.shading = 'unlit';
    mod.config.emissiveStrength = 1.5;
    mod.config.depthTest = true;
    mod.config.depthWrite = false;
  } else if (material === 'multiply') {
    mod.config.blendMode = 'multiply';
    mod.config.shading = 'unlit';
    mod.config.emissiveStrength = 1;
    mod.config.depthTest = true;
    mod.config.depthWrite = false;
  } else if (material === 'softSmoke') {
    mod.config.blendMode = 'alpha';
    mod.config.shading = 'lit';
    mod.config.emissiveStrength = 0.6;
    mod.config.depthTest = true;
    mod.config.depthWrite = false;
  } else {
    mod.config.blendMode = 'alpha';
    mod.config.shading = 'unlit';
    mod.config.emissiveStrength = 1;
    mod.config.depthTest = true;
    mod.config.depthWrite = false;
  }
}

interface MeshUploadOpts {
  name?: string;
  onChange: (
    asset: RendererModule['config']['customMesh'] | undefined,
    texture: string | undefined,
  ) => void;
}

function makeMeshSetEditor(mod: RendererModule, onChange: () => void): HTMLElement {
  const wrap = el('div', 'pi-image-upload');
  const render = (): void => {
    wrap.innerHTML = '';
    if (mod.config.meshSlots.length === 0) {
      const hint = el('div', 'pi-image-name');
      hint.textContent = 'Optional custom variants';
      wrap.appendChild(hint);
    } else {
      const label = el('div', 'pi-image-name');
      label.textContent = `${mod.config.meshSlots.length} variant${mod.config.meshSlots.length === 1 ? '' : 's'}`;
      wrap.appendChild(label);
    }

    const addCustom = el('button', 'pi-btn-mini') as HTMLButtonElement;
    addCustom.type = 'button';
    addCustom.textContent = '+ File';
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.glb,.gltf,.fbx,.obj,model/gltf-binary,model/gltf+json,application/octet-stream,text/plain';
    input.multiple = true;
    input.style.display = 'none';
    addCustom.onclick = () => input.click();
    input.onchange = async () => {
      const files = input.files;
      if (!files?.length || mod.config.meshSlots.length >= 4) return;
      try {
        const imported = await importMeshFiles(files);
        mod.config.meshSlots.push({
          id: `mesh_${Date.now().toString(36)}`,
          name: imported.asset.name,
          weight: 1,
          asset: imported.asset,
          texture: imported.texture,
        });
        onChange();
      } catch (err) {
        console.warn('[particles] mesh import failed:', err);
      }
    };

    wrap.append(addCustom, input);
  };
  render();

  const stack = el('div');
  stack.style.display = 'flex';
  stack.style.flexDirection = 'column';
  stack.style.gap = '4px';
  stack.style.width = '100%';
  stack.appendChild(wrap);

  mod.config.meshSlots.forEach((slot, index) => {
    const row = el('div', 'pi-image-upload');
    const name = el('div', 'pi-image-name');
    name.textContent = slot.name;
    const weight = makeNumber(slot.weight, {
      min: 0.01, max: 100, step: 0.1, precision: 2,
      onChange: (v) => {
        slot.weight = Math.max(0.01, v);
        onChange();
      },
    });
    weight.style.maxWidth = '62px';
    const del = el('button', 'pi-image-clear') as HTMLButtonElement;
    del.type = 'button';
    del.title = 'Remove mesh variant';
    del.textContent = '×';
    del.onclick = () => {
      mod.config.meshSlots.splice(index, 1);
      onChange();
    };
    row.append(name, weight, del);
    stack.appendChild(row);
  });

  return stack;
}

function makeMeshUpload(opts: MeshUploadOpts): HTMLElement {
  const wrap = el('div', 'pi-image-upload');
  let currentName = opts.name;

  const render = (): void => {
    wrap.innerHTML = '';
    if (currentName) {
      const label = el('div', 'pi-image-name');
      label.textContent = currentName;
      const clear = el('button', 'pi-image-clear') as HTMLButtonElement;
      clear.type = 'button';
      clear.title = 'Remove custom mesh';
      clear.textContent = '×';
      clear.onclick = () => {
        currentName = undefined;
        opts.onChange(undefined, undefined);
        render();
      };
      wrap.append(label, clear);
      return;
    }

    const btn = el('button', 'pi-image-pick') as HTMLButtonElement;
    btn.type = 'button';
    btn.textContent = 'Choose Mesh…';
    const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.glb,.gltf,.fbx,.obj,model/gltf-binary,model/gltf+json,application/octet-stream,text/plain';
      input.multiple = true;
    input.style.display = 'none';
    btn.onclick = () => input.click();
    input.onchange = async () => {
      const files = input.files;
      if (!files?.length) return;
      try {
        const imported = await importMeshFiles(files);
        currentName = imported.asset.name;
        opts.onChange(imported.asset, imported.texture);
        render();
      } catch (err) {
        console.warn('[particles] mesh import failed:', err);
      }
    };
    wrap.append(btn, input);
  };

  render();
  return wrap;
}

async function importMeshFiles(files: FileList | File[]): Promise<{
  asset: NonNullable<RendererModule['config']['customMesh']>;
  texture?: string;
}> {
  const list = Array.from(files);
  const file = list.find((f) => /\.(glb|gltf|fbx|obj)$/i.test(f.name)) ?? list[0];
  if (!file) throw new Error('No mesh file selected.');
  const sidecars = makeSidecarResolver(list);
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'obj') {
    const text = await file.text();
    return { asset: parseObjMesh(text, file.name) };
  }

  const buffer = await file.arrayBuffer();
  try {
    if (ext === 'fbx') {
      return await importFbxMesh(buffer, file.name, sidecars.manager);
    }
    return await importGltfMesh(buffer, file.name, sidecars.manager);
  } finally {
    sidecars.dispose();
  }
}

async function importFbxMesh(buffer: ArrayBuffer, name: string, manager?: THREE.LoadingManager): Promise<{
  asset: NonNullable<RendererModule['config']['customMesh']>;
  texture?: string;
}> {
  const group = new FBXLoader(manager).parse(buffer, '');
  const found = findFirstMesh(group);
  if (!found) throw new Error('No mesh found in FBX.');
  const geometry = found.geometry.index ? found.geometry.toNonIndexed() : found.geometry;
  const asset = meshAssetFromGeometry(geometry, name);
  const texture = await textureFromMaterial(found.material);
  return { asset, texture };
}

async function importGltfMesh(buffer: ArrayBuffer, name: string, manager?: THREE.LoadingManager): Promise<{
  asset: NonNullable<RendererModule['config']['customMesh']>;
  texture?: string;
}> {
  const loader = new GLTFLoader(manager);
  const gltf = await loader.parseAsync(buffer, '');
  const found = findFirstMesh(gltf.scene);
  if (!found) throw new Error('No mesh found in GLB/GLTF.');
  const geometry = found.geometry.index ? found.geometry.toNonIndexed() : found.geometry;
  const asset = meshAssetFromGeometry(geometry, name);
  const texture = await textureFromMaterial(found.material);
  return { asset, texture };
}

function makeSidecarResolver(files: File[]): { manager: THREE.LoadingManager; dispose: () => void } {
  const urls = new Map<string, string>();
  for (const file of files) {
    const url = URL.createObjectURL(file);
    urls.set(file.name, url);
    urls.set(file.name.split('/').pop() ?? file.name, url);
  }
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    const clean = decodeURIComponent(url.split('?')[0]?.split('#')[0] ?? url);
    const name = clean.split('/').pop() ?? clean;
    return urls.get(clean) ?? urls.get(name) ?? url;
  });
  return {
    manager,
    dispose: () => {
      for (const url of urls.values()) URL.revokeObjectURL(url);
    },
  };
}

function findFirstMesh(root: THREE.Object3D): THREE.Mesh | null {
  let found: THREE.Mesh | null = null;
  root.traverse((obj) => {
    if (!found && (obj as THREE.Mesh).isMesh) found = obj as THREE.Mesh;
  });
  return found;
}

function meshAssetFromGeometry(
  geometry: THREE.BufferGeometry,
  name: string,
): NonNullable<RendererModule['config']['customMesh']> {
  const position = geometry.getAttribute('position');
  if (!position) throw new Error('Mesh has no positions.');
  let normal = geometry.getAttribute('normal');
  if (!normal) {
    geometry.computeVertexNormals();
    normal = geometry.getAttribute('normal');
  }
  const uv = geometry.getAttribute('uv');
  const vertices: number[] = [];
  const indices: number[] = [];
  const count = Math.min(position.count, 65_535);

  for (let i = 0; i < count; i++) {
    vertices.push(
      position.getX(i), position.getY(i), position.getZ(i),
      normal?.getX(i) ?? 0, normal?.getY(i) ?? 1, normal?.getZ(i) ?? 0,
      uv?.getX(i) ?? 0, uv?.getY(i) ?? 0,
    );
    indices.push(i);
  }

  return { name, vertices, indices };
}

async function textureFromMaterial(material: THREE.Material | THREE.Material[]): Promise<string | undefined> {
  const first = Array.isArray(material) ? material[0] : material;
  const map = (first as THREE.MeshBasicMaterial | THREE.MeshStandardMaterial | undefined)?.map;
  const image = map?.image as HTMLImageElement | HTMLCanvasElement | ImageBitmap | undefined;
  if (!image) return undefined;
  return imageToDataUrl(image);
}

function imageToDataUrl(image: HTMLImageElement | HTMLCanvasElement | ImageBitmap): string | undefined {
  try {
    if (image instanceof HTMLCanvasElement) return image.toDataURL('image/png');
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    ctx.drawImage(image, 0, 0);
    return canvas.toDataURL('image/png');
  } catch {
    return undefined;
  }
}

function parseObjMesh(
  source: string,
  name: string,
): NonNullable<RendererModule['config']['customMesh']> {
  const positions: Array<[number, number, number]> = [];
  const normals: Array<[number, number, number]> = [];
  const uvs: Array<[number, number]> = [];
  const vertices: number[] = [];
  const indices: number[] = [];

  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(/\s+/);
    if (parts[0] === 'v') {
      positions.push([Number(parts[1] ?? 0), Number(parts[2] ?? 0), Number(parts[3] ?? 0)]);
    } else if (parts[0] === 'vn') {
      normals.push([Number(parts[1] ?? 0), Number(parts[2] ?? 1), Number(parts[3] ?? 0)]);
    } else if (parts[0] === 'vt') {
      uvs.push([Number(parts[1] ?? 0), Number(parts[2] ?? 0)]);
    } else if (parts[0] === 'f') {
      const refs = parts.slice(1).map((p) => parseObjRef(p));
      for (let i = 1; i < refs.length - 1; i++) {
        const a = refs[0]!;
        const b = refs[i]!;
        const c = refs[i + 1]!;
        const fallback = normalOfPositions(
          positions[a.p] ?? [0, 0, 0],
          positions[b.p] ?? [0, 0, 0],
          positions[c.p] ?? [0, 0, 0],
        );
        appendObjVertex(a, positions, normals, uvs, vertices, indices, fallback);
        appendObjVertex(b, positions, normals, uvs, vertices, indices, fallback);
        appendObjVertex(c, positions, normals, uvs, vertices, indices, fallback);
      }
    }
    if (indices.length >= 65_535) break;
  }

  return { name, vertices, indices };
}

function parseObjRef(ref: string): { p: number; uv?: number; n?: number } {
  const [p, uv, n] = ref.split('/');
  return {
    p: Math.max(0, Number(p) - 1),
    uv: uv ? Math.max(0, Number(uv) - 1) : undefined,
    n: n ? Math.max(0, Number(n) - 1) : undefined,
  };
}

function appendObjVertex(
  ref: { p: number; uv?: number; n?: number },
  positions: Array<[number, number, number]>,
  normals: Array<[number, number, number]>,
  uvs: Array<[number, number]>,
  vertices: number[],
  indices: number[],
  fallbackNormal: [number, number, number],
): void {
  if (indices.length >= 65_535) return;
  const p = positions[ref.p] ?? [0, 0, 0];
  const n = ref.n !== undefined ? normals[ref.n] : undefined;
  const uv = ref.uv !== undefined ? uvs[ref.uv] : undefined;
  vertices.push(
    p[0], p[1], p[2],
    n?.[0] ?? fallbackNormal[0],
    n?.[1] ?? fallbackNormal[1],
    n?.[2] ?? fallbackNormal[2],
    uv?.[0] ?? 0,
    uv?.[1] ?? 0,
  );
  indices.push(indices.length);
}

function normalOfPositions(
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number],
): [number, number, number] {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

/**
 * Emission panel: continuous Rate (particles/sec) plus a Bursts list.
 * Both can run simultaneously — set rate=0 for pure burst mode, leave bursts
 * empty for pure continuous. The bursts list is rebuilt in place when stops
 * are added/removed so indices stay correct.
 */
function populateEmissionPanel(
  panel: Panel,
  mod: EmissionModule,
  view: ParticleSystemView,
  notify: () => void,
): void {
  const render = (): void => {
    panel.body.innerHTML = '';

    panel.body.appendChild(makeRow('Rate',
      makeSlider(mod.config.rate, {
        min: 0, max: 20000, step: 1, precision: 0,
        onChange: (v) => {
          mod.config.rate = v;
          view.backend.patchUniform('emission', 'rate', v);
          notify();
        },
      }),
    ));

    panel.body.appendChild(makeDivider());

    // Bursts section header + add button
    const head = el('div', 'pi-row pi-burst-head');
    const headLbl = el('div', 'pi-row-label');
    headLbl.textContent = `Bursts (${mod.config.bursts.length})`;
    const headCtrl = el('div', 'pi-row-control');
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'pi-btn-mini';
    addBtn.textContent = '+ Add';
    addBtn.title = 'Add a burst';
    addBtn.onclick = () => {
      mod.config.bursts.push({ time: 0, count: 30 });
      // Re-auditioning after edits handles the rest.
      render();
      notify();
    };
    headCtrl.appendChild(addBtn);
    head.append(headLbl, headCtrl);
    panel.body.appendChild(head);

    if (mod.config.bursts.length === 0) {
      const hint = el('div', 'pi-row');
      const hintCtrl = el('div', 'pi-row-control pi-burst-hint');
      hintCtrl.textContent = 'No bursts. Continuous emission only.';
      const hintLbl = el('div', 'pi-row-label');
      hint.append(hintLbl, hintCtrl);
      panel.body.appendChild(hint);
      return;
    }

    mod.config.bursts.forEach((burst, i) => {
      const row = el('div', 'pi-row pi-burst-row');
      const lbl = el('div', 'pi-row-label');
      lbl.textContent = `#${i + 1}`;
      const ctrl = el('div', 'pi-row-control pi-burst-ctrl');

      const tField = el('div', 'pi-burst-field');
      const tCap = el('span', 'pi-burst-cap');
      tCap.textContent = 'time';
      tField.append(tCap, makeNumber(burst.time, {
        min: 0, max: 60, step: 0.1, precision: 2,
        onChange: (v) => { burst.time = v; notify(); },
      }));

      const cField = el('div', 'pi-burst-field');
      const cCap = el('span', 'pi-burst-cap');
      cCap.textContent = 'count';
      cField.append(cCap, makeNumber(burst.count, {
        min: 1, max: 10000, step: 1, precision: 0,
        onChange: (v) => { burst.count = Math.max(1, Math.floor(v)); notify(); },
      }));

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'pi-btn-mini pi-btn-del';
      del.textContent = '×';
      del.title = 'Remove burst';
      del.onclick = () => {
        mod.config.bursts.splice(i, 1);
        render();
        notify();
      };

      ctrl.append(tField, cField, del);
      row.append(lbl, ctrl);
      panel.body.appendChild(row);
    });
  };

  render();
}

/**
 * Shape panel rows depend on the current `kind` — sphere needs radius, cone
 * adds angle, plane/terrain swap to width/depth, terrain adds height + freq.
 * The kind dropdown rebuilds the rest of the panel in place and refreshes the
 * 3D gizmo. Every other control patches its uniform and pokes the gizmo.
 */
function populateShapePanel(
  panel: Panel,
  mod: ShapeModule,
  view: ParticleSystemView,
  notify: () => void,
  gizmo: ShapeGizmo | null,
): void {
  const render = (): void => {
    panel.body.innerHTML = '';

    panel.body.appendChild(makeRow('Kind',
      makeDropdown<ShapeKind>(
        mod.config.kind,
        [
          { value: 'sphere',     label: 'Sphere' },
          { value: 'hemisphere', label: 'Hemisphere' },
          { value: 'cone',       label: 'Cone' },
          { value: 'box',        label: 'Box' },
          { value: 'circle',     label: 'Circle' },
          { value: 'plane',      label: 'Plane' },
          { value: 'terrain',    label: 'Terrain' },
          { value: 'torus',      label: 'Torus' },
          { value: 'mesh',       label: 'Mesh' },
        ],
        (v) => {
          mod.config.kind = v;
          view.backend.patchUniform('shape', 'kind', SHAPE_KIND_INDEX[v]);
          gizmo?.rebuild();
          notify();
          render();
        },
      ),
    ));

    const kind = mod.config.kind;
    const radial = kind === 'sphere' || kind === 'hemisphere'
                || kind === 'cone'   || kind === 'circle' || kind === 'torus';

    if (radial) {
      panel.body.appendChild(makeRow('Radius',
        makeSlider(mod.config.radius, {
          min: 0, max: 20, step: 0.05, precision: 2,
          onChange: (v) => {
            mod.config.radius = v;
            view.backend.patchUniform('shape', 'radius', v);
            gizmo?.rebuild();
            notify();
          },
        }),
      ));
    }

    if (kind === 'cone') {
      panel.body.appendChild(makeRow('Angle',
        makeSlider(mod.config.angle, {
          min: 0, max: Math.PI / 2, step: 0.01, precision: 3,
          onChange: (v) => {
            mod.config.angle = v;
            view.backend.patchUniform('shape', 'angle', v);
            gizmo?.rebuild();
            notify();
          },
        }),
      ));
    }

    if (kind === 'plane' || kind === 'terrain') {
      panel.body.appendChild(makeRow('Width',
        makeSlider(mod.config.planeSize[0], {
          min: 0.1, max: 20, step: 0.1, precision: 1,
          onChange: (v) => {
            mod.config.planeSize = [v, mod.config.planeSize[1]];
            view.backend.patchUniform('shape', 'plane_size', [v, mod.config.planeSize[1]]);
            gizmo?.rebuild();
            notify();
          },
        }),
      ));
      panel.body.appendChild(makeRow('Depth',
        makeSlider(mod.config.planeSize[1], {
          min: 0.1, max: 20, step: 0.1, precision: 1,
          onChange: (v) => {
            mod.config.planeSize = [mod.config.planeSize[0], v];
            view.backend.patchUniform('shape', 'plane_size', [mod.config.planeSize[0], v]);
            gizmo?.rebuild();
            notify();
          },
        }),
      ));
    }

    if (kind === 'terrain') {
      panel.body.appendChild(makeRow('Height',
        makeSlider(mod.config.terrainHeight, {
          min: 0, max: 3, step: 0.01, precision: 2,
          onChange: (v) => {
            mod.config.terrainHeight = v;
            view.backend.patchUniform('shape', 'terrain_h', v);
            gizmo?.rebuild();
            notify();
          },
        }),
      ));
      panel.body.appendChild(makeRow('Frequency',
        makeSlider(mod.config.terrainFreq, {
          min: 0.1, max: 8, step: 0.05, precision: 2,
          onChange: (v) => {
            mod.config.terrainFreq = v;
            view.backend.patchUniform('shape', 'terrain_f', v);
            gizmo?.rebuild();
            notify();
          },
        }),
      ));
    }
    if (kind === 'torus') {
      panel.body.appendChild(makeRow('Tube Radius',
        makeSlider(mod.config.torusThickness, {
          min: 0, max: 5, step: 0.01, precision: 2,
          onChange: (v) => {
            mod.config.torusThickness = v;
            view.backend.patchUniform('shape', 'torus_tube', v);
            gizmo?.rebuild();
            notify();
          },
        }),
      ));
    }
    if (kind === 'mesh') {
      panel.body.append(
        makeRow('Source Mesh', makeMeshUpload({
          name: mod.config.mesh?.name,
          onChange: (asset) => {
            mod.config.mesh = asset;
            notify();
          },
        })),
        makeRow('Emit From', makeSegmented<'surface' | 'vertices' | 'edges'>(mod.config.meshEmitSource, [
          { value: 'surface', label: 'Surface' },
          { value: 'vertices', label: 'Vertices' },
          { value: 'edges', label: 'Edges' },
        ], (value) => { mod.config.meshEmitSource = value; notify(); })),
      );
    }

    // From Shell only matters for volume-like shapes; plane/terrain are
    // already surfaces, box doesn't currently respect it.
    if (radial) {
      panel.body.appendChild(makeRow('From Shell',
        makeToggle(mod.config.emitFromShell, (v) => {
          mod.config.emitFromShell = v;
          view.backend.patchUniform('shape', 'shell', v ? 1 : 0);
          notify();
        }),
      ));
    }
  };

  render();
}

function moduleTitle(id: string): string {
  // Single source of truth — pulled from the catalog so renaming a module
  // updates headers and persistence display together.
  const entry = AVAILABLE_MODULES.find((m) => m.id === id);
  return entry?.label ?? id;
}
