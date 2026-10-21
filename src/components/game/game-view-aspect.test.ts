import { describe, expect, it } from "vitest";
import {
  GAME_VIEW_BUILTIN_PRESETS,
  gameViewAspectRatio,
  gameViewOutputSize,
  makeCustomGameViewPreset,
  parseCustomGameViewPresets,
  customGameViewResolutionError,
} from "./game-view-aspect";

describe("Game view aspect presets", () => {
  it("keeps Free Aspect fluid and derives constrained aspect ratios", () => {
    expect(gameViewAspectRatio(GAME_VIEW_BUILTIN_PRESETS[0])).toBeNull();
    expect(gameViewAspectRatio(GAME_VIEW_BUILTIN_PRESETS[1])).toBeCloseTo(16 / 9);
    expect(gameViewOutputSize(GAME_VIEW_BUILTIN_PRESETS[1], false)).toBeNull();
  });

  it("uses exact output dimensions and halves them in Low Resolution mode", () => {
    const fullHd = GAME_VIEW_BUILTIN_PRESETS.find((preset) => preset.id === "full-hd")!;
    expect(gameViewOutputSize(fullHd, false)).toEqual({ width: 1920, height: 1080 });
    expect(gameViewOutputSize(fullHd, true)).toEqual({ width: 960, height: 540 });
  });

  it("keeps projection aspect independent from output pixel density", () => {
    const fullHd = GAME_VIEW_BUILTIN_PRESETS.find((preset) => preset.id === "full-hd")!;
    const fourK = GAME_VIEW_BUILTIN_PRESETS.find((preset) => preset.id === "4k-uhd")!;
    const lowResolution4k = gameViewOutputSize(fourK, true)!;

    expect(gameViewAspectRatio(fullHd)).toBeCloseTo(16 / 9);
    expect(gameViewAspectRatio(fourK)).toBeCloseTo(16 / 9);
    expect(lowResolution4k.width / lowResolution4k.height).toBeCloseTo(gameViewAspectRatio(fourK)!);
  });

  it("creates and validates bounded custom resolutions", () => {
    const preset = makeCustomGameViewPreset(720, 1280);
    expect(preset).toMatchObject({
      label: "720×1280",
      kind: "resolution",
      custom: true,
    });
    expect(preset?.id).toMatch(/^custom-720x1280-/);
    expect(makeCustomGameViewPreset(10, 1280)).toBeNull();
    expect(makeCustomGameViewPreset(8192, 8192)).toBeNull();
    expect(customGameViewResolutionError(8192, 8192)).toMatch(/megapixel/);
    expect(parseCustomGameViewPresets([preset, preset, { id: "unsafe", width: 400, height: 400 }])).toEqual([preset]);
  });
});
