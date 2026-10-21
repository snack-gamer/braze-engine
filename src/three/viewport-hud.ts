import type { FrameTelemetryDiagnosticProjection } from "../rendering/runtime/telemetry/frame-telemetry-diagnostic-projection";
import { createViewportHudModel, type ViewportHudReadout } from "./viewport-hud-model";
import type { ViewportStatsSnapshot } from "./viewport-stats";

const COLLAPSE_KEY = "tgan:viewport-hud-collapsed";

export type ViewportHud = {
  setVisible: (visible: boolean) => void;
  update: (
    stats: ViewportStatsSnapshot,
    telemetry?: FrameTelemetryDiagnosticProjection | null,
  ) => void;
  destroy: () => void;
};

type HudReadoutKey =
  | "raf"
  | "submitted"
  | "retired"
  | "gpuTiming"
  | "memory"
  | "meshes"
  | "vertices"
  | "final"
  | "render"
  | "gpu";
type HudField = `${HudReadoutKey}${"Label" | "Value" | "Detail"}`;

export function createViewportHud(root: HTMLElement): ViewportHud {
  const panel = document.createElement("section");
  panel.className = "viewport-hud";
  panel.setAttribute("aria-label", "Viewport statistics");
  panel.innerHTML = /* html */ `
    <div class="viewport-hud__head" role="button" tabindex="0" aria-expanded="true" aria-label="Toggle viewport statistics">
      <svg class="viewport-hud__chevron editor-icon editor-icon--micro editor-icon--stroke-regular" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <div class="viewport-hud__title">Stats</div>
      <div class="viewport-hud__live">LIVE</div>
    </div>
    <div class="viewport-hud__body"><div class="viewport-hud__body-inner">
      <div class="viewport-hud__total">
        <span data-viewport-stat="rafLabel">RAF opportunity</span>
        <strong data-viewport-stat="rafValue">—</strong>
        <small data-viewport-stat="rafDetail">Telemetry unavailable</small>
      </div>
      <div class="viewport-hud__counts">
        <div class="viewport-hud__stat"><span data-viewport-stat="memoryLabel">JS heap</span><strong data-viewport-stat="memoryValue">—</strong><small data-viewport-stat="memoryDetail">Browser heap telemetry unavailable</small></div>
        <div class="viewport-hud__stat"><span data-viewport-stat="meshesLabel">Meshes</span><strong data-viewport-stat="meshesValue">0</strong><small data-viewport-stat="meshesDetail">visible</small></div>
        <div class="viewport-hud__stat"><span data-viewport-stat="verticesLabel">Verts</span><strong data-viewport-stat="verticesValue">0</strong><small data-viewport-stat="verticesDetail">visible</small></div>
      </div>
      <div class="viewport-hud__row"><span data-viewport-stat="submittedLabel">Device work</span><div><strong data-viewport-stat="submittedValue">—</strong><small data-viewport-stat="submittedDetail">Telemetry unavailable</small></div></div>
      <div class="viewport-hud__row"><span data-viewport-stat="retiredLabel">Queue retired</span><div><strong data-viewport-stat="retiredValue">—</strong><small data-viewport-stat="retiredDetail">Telemetry unavailable</small></div></div>
      <div class="viewport-hud__row"><span data-viewport-stat="gpuTimingLabel">GPU render window</span><div><strong data-viewport-stat="gpuTimingValue">—</strong><small data-viewport-stat="gpuTimingDetail">Timestamp samples unavailable</small></div></div>
      <div class="viewport-hud__row"><span data-viewport-stat="finalLabel">Final</span><div><strong data-viewport-stat="finalValue">—</strong><small data-viewport-stat="finalDetail">output</small></div></div>
      <div class="viewport-hud__row"><span data-viewport-stat="renderLabel">Render</span><div><strong data-viewport-stat="renderValue">—</strong><small data-viewport-stat="renderDetail">draw calls</small></div></div>
      <div class="viewport-hud__row"><span data-viewport-stat="gpuLabel">GPU memory</span><div><strong data-viewport-stat="gpuValue">—</strong><small data-viewport-stat="gpuDetail">device aggregate</small></div></div>
    </div></div>
  `;
  root.appendChild(panel);

  const head = panel.querySelector<HTMLElement>(".viewport-hud__head")!;
  const refs = new Map<HudField, HTMLElement>();
  for (const element of panel.querySelectorAll<HTMLElement>("[data-viewport-stat]")) {
    refs.set(element.dataset.viewportStat as HudField, element);
  }
  const setText = (field: HudField, value: string) => {
    const element = refs.get(field);
    if (element) element.textContent = value;
  };
  const renderReadout = (key: HudReadoutKey, readout: ViewportHudReadout) => {
    setText(`${key}Label` as HudField, readout.label);
    setText(`${key}Value` as HudField, readout.value);
    setText(`${key}Detail` as HudField, readout.detail);
    const value = refs.get(`${key}Value` as HudField);
    if (value) value.dataset.availability = readout.availability;
  };

  const setExpandedState = () => {
    head.setAttribute("aria-expanded", String(!panel.classList.contains("is-collapsed")));
  };
  const toggle = () => {
    const collapsed = panel.classList.toggle("is-collapsed");
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch {
      // Storage may be disabled in embedded or sandboxed editor contexts.
    }
    setExpandedState();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    toggle();
  };

  try {
    if (localStorage.getItem(COLLAPSE_KEY) === "1") panel.classList.add("is-collapsed");
  } catch {
    // Keep the default expanded state when storage is unavailable.
  }
  setExpandedState();
  head.addEventListener("click", toggle);
  head.addEventListener("keydown", onKeyDown);

  return {
    setVisible: (visible) => {
      const hidden = !visible;
      if (panel.hidden !== hidden) panel.hidden = hidden;
    },
    update: (stats, telemetry = null) => {
      const model = createViewportHudModel(stats, telemetry);
      renderReadout("raf", model.rafOpportunity);
      renderReadout("submitted", model.submitted);
      renderReadout("retired", model.queueRetired);
      renderReadout("gpuTiming", model.gpuRenderWindow);
      renderReadout("memory", model.memory);
      renderReadout("meshes", model.meshes);
      renderReadout("vertices", model.vertices);
      renderReadout("final", model.finalSize);
      renderReadout("render", model.render);
      renderReadout("gpu", model.gpuResources);
    },
    destroy: () => {
      head.removeEventListener("click", toggle);
      head.removeEventListener("keydown", onKeyDown);
      panel.remove();
    },
  };
}
