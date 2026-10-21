import { createAuthoredId } from "../../identity/authored-id";

export type GameViewAspectPreset = {
  id: string;
  label: string;
  kind: "free" | "aspect" | "resolution";
  width?: number;
  height?: number;
  custom?: boolean;
};

export const GAME_VIEW_BUILTIN_PRESETS: GameViewAspectPreset[] = [
  { id: "free", label: "Free Aspect", kind: "free" },
  { id: "aspect-16-9", label: "16:9 Aspect", kind: "aspect", width: 16, height: 9 },
  { id: "aspect-16-10", label: "16:10 Aspect", kind: "aspect", width: 16, height: 10 },
  { id: "full-hd", label: "Full HD (1920×1080)", kind: "resolution", width: 1920, height: 1080 },
  { id: "wxga", label: "WXGA (1366×768)", kind: "resolution", width: 1366, height: 768 },
  { id: "qhd", label: "QHD (2560×1440)", kind: "resolution", width: 2560, height: 1440 },
  { id: "4k-uhd", label: "4K UHD (3840×2160)", kind: "resolution", width: 3840, height: 2160 },
  { id: "portrait-1080-1920", label: "1080×1920", kind: "resolution", width: 1080, height: 1920 },
  { id: "crazygames-small", label: "Small CrazyGames (922×487)", kind: "resolution", width: 922, height: 487 },
  { id: "ultrawide-3474-868", label: "3474×868", kind: "resolution", width: 3474, height: 868 },
  { id: "triple-6048-1680", label: "6048×1680", kind: "resolution", width: 6048, height: 1680 },
  { id: "ultrawide-1737-434", label: "1737×434", kind: "resolution", width: 1737, height: 434 },
  { id: "portrait-600-960", label: "600×960", kind: "resolution", width: 600, height: 960 },
  { id: "desktop-1366-768", label: "1366×768", kind: "resolution", width: 1366, height: 768 },
  { id: "poki", label: "Poki (1031×580)", kind: "resolution", width: 1031, height: 580 },
  { id: "facebook-creative", label: "Facebook Creative (1080×1350)", kind: "resolution", width: 1080, height: 1350 },
  { id: "social-1200-628", label: "1200×628", kind: "resolution", width: 1200, height: 628 },
  { id: "portrait-hd", label: "HD Portrait (1080×1920)", kind: "resolution", width: 1080, height: 1920 },
  { id: "small-200-280", label: "200×280", kind: "resolution", width: 200, height: 280 },
];

const CUSTOM_ID_RE = /^custom-[a-z0-9-]{1,72}$/;
const MAX_CUSTOM_PRESETS = 24;
export const MAX_CUSTOM_RESOLUTION_DIMENSION = 8192;
export const MAX_CUSTOM_RESOLUTION_PIXELS = 4096 * 4096;

export function customGameViewResolutionError(width: number, height: number): string | null {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 32 || height < 32) {
    return "Width and height must be whole numbers of at least 32 pixels.";
  }
  if (width > MAX_CUSTOM_RESOLUTION_DIMENSION || height > MAX_CUSTOM_RESOLUTION_DIMENSION) {
    return `Maximum dimension is ${MAX_CUSTOM_RESOLUTION_DIMENSION}px.`;
  }
  if (width * height > MAX_CUSTOM_RESOLUTION_PIXELS) {
    return "Resolution exceeds the safe 16.8 megapixel Game-view budget.";
  }
  return null;
}

function validDimensionPair(width: unknown, height: unknown): { width: number; height: number } | null {
  return typeof width === "number"
    && typeof height === "number"
    && customGameViewResolutionError(width, height) === null
    ? { width, height }
    : null;
}

function validAspectDimension(value: unknown): value is number {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

export function gameViewAspectRatio(preset: GameViewAspectPreset): number | null {
  if (preset.kind === "free" || !validAspectDimension(preset.width) || !validAspectDimension(preset.height)) return null;
  return preset.width / preset.height;
}

export function gameViewOutputSize(
  preset: GameViewAspectPreset,
  lowResolution: boolean,
): { width: number; height: number } | null {
  const dimensions = validDimensionPair(preset.width, preset.height);
  if (preset.kind !== "resolution" || !dimensions) return null;
  const divisor = lowResolution ? 2 : 1;
  return {
    width: Math.max(1, Math.round(dimensions.width / divisor)),
    height: Math.max(1, Math.round(dimensions.height / divisor)),
  };
}

export function makeCustomGameViewPreset(width: number, height: number): GameViewAspectPreset | null {
  if (customGameViewResolutionError(width, height)) return null;
  return {
    id: createAuthoredId(`custom-${width}x${height}`),
    label: `${width}×${height}`,
    kind: "resolution",
    width,
    height,
    custom: true,
  };
}

export function parseCustomGameViewPresets(value: unknown): GameViewAspectPreset[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  const parsed: GameViewAspectPreset[] = [];
  for (const entry of value) {
    if (parsed.length >= MAX_CUSTOM_PRESETS || !entry || typeof entry !== "object") break;
    const candidate = entry as Partial<GameViewAspectPreset>;
    const dimensions = validDimensionPair(candidate.width, candidate.height);
    if (
      typeof candidate.id !== "string"
      || !CUSTOM_ID_RE.test(candidate.id)
      || ids.has(candidate.id)
      || !dimensions
    ) continue;
    ids.add(candidate.id);
    parsed.push({
      id: candidate.id,
      label: `${dimensions.width}×${dimensions.height}`,
      kind: "resolution",
      width: dimensions.width,
      height: dimensions.height,
      custom: true,
    });
  }
  return parsed;
}
