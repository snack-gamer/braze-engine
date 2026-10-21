import { describe, expect, it } from "vitest";
import {
  LEGACY_SKY_LIGHT_DEFAULTS,
  readLegacySkyLightInput,
} from "./legacy-sky-light-input";

describe("legacy Sun-from-Sky input", () => {
  it("reads and clamps removed fields only for a legacy sky world", () => {
    expect(readLegacySkyLightInput({
      worldSource: "sky",
      sky: { sunAltitudeDeg: 120, sunAzimuthDeg: -20 },
    })).toEqual({ altitudeDeg: 90, azimuthDeg: 0 });
    expect(readLegacySkyLightInput({ worldSource: "hdri", sky: {
      sunAltitudeDeg: 20,
      sunAzimuthDeg: 40,
    } })).toBeNull();
  });

  it("uses deterministic migration defaults for incomplete old documents", () => {
    expect(readLegacySkyLightInput({ backgroundMode: "sky", sky: {} }))
      .toEqual(LEGACY_SKY_LIGHT_DEFAULTS);
    expect(readLegacySkyLightInput(null)).toBeNull();
  });
});
