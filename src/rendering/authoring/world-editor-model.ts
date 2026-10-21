import type { WorldSource } from "../domain/environment-settings";

export type SkyEditorTab = "atmosphere" | "clouds" | "fog" | "postfx" | "galaxy";

export const WORLD_SOURCE_OPTIONS = [
  { id: "hdri" as const, label: "HDRI" },
  { id: "sky" as const, label: "Sky" },
];

export const WORLD_SOURCE_META: Record<WorldSource, string> = {
  hdri: "Image-based light",
  sky: "Procedural WebGPU sky",
};

const SKY_TABS: Array<{ id: SkyEditorTab; label: string }> = [
  { id: "atmosphere", label: "Atmosphere" },
  { id: "clouds", label: "Clouds" },
  { id: "fog", label: "Fog" },
  { id: "postfx", label: "Post FX" },
  { id: "galaxy", label: "Galaxy" },
];
const SKY_TAB_IDS = SKY_TABS.map((tab) => tab.id);

export function skyEditorTabs() {
  return SKY_TABS;
}

export function skyEditorTabIds(): SkyEditorTab[] {
  return SKY_TAB_IDS;
}

export { DEFAULT_CLOUD_SETTINGS } from "./cloud-presets";

export function formatAssetSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}
