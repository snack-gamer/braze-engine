import { describe, expect, it } from "vitest";
import { calculateModelPreviewFrame } from "./model-preview-frame";

describe("model preview framing", () => {
  it("fits a padded sphere against the limiting field of view", () => {
    const frame = calculateModelPreviewFrame({
      radius: 2,
      aspect: 16 / 9,
      verticalFovDegrees: 60,
      padding: 1.2,
    });

    expect(frame.distance).toBeCloseTo(4.8, 10);
    expect(frame.near).toBeCloseTo(2.4, 10);
    expect(frame.far).toBeCloseTo(7.2, 10);
  });

  it("uses horizontal field of view for a portrait preview", () => {
    const landscape = calculateModelPreviewFrame({
      radius: 1,
      aspect: 2,
      verticalFovDegrees: 60,
      padding: 1,
    });
    const portrait = calculateModelPreviewFrame({
      radius: 1,
      aspect: 0.5,
      verticalFovDegrees: 60,
      padding: 1,
    });
    const portraitHalfFov = Math.atan(0.5 * Math.tan(Math.PI / 6));

    expect(portrait.distance).toBeCloseTo(1 / Math.sin(portraitHalfFov), 10);
    expect(portrait.distance).toBeGreaterThan(landscape.distance);
  });

  it("adds margin without changing the framing proportions", () => {
    const exact = calculateModelPreviewFrame({
      radius: 3,
      aspect: 1,
      verticalFovDegrees: 45,
      padding: 1,
    });
    const padded = calculateModelPreviewFrame({
      radius: 3,
      aspect: 1,
      verticalFovDegrees: 45,
      padding: 1.25,
    });

    expect(padded.distance / exact.distance).toBeCloseTo(1.25, 10);
    expect(padded.near).toBeLessThan(padded.distance - 3);
    expect(padded.far).toBeGreaterThan(padded.distance + 3);
  });

  it("returns the same canonical distance for zoom reset", () => {
    const input = { radius: 4, aspect: 1.5, verticalFovDegrees: 32, padding: 1.14 };

    expect(calculateModelPreviewFrame(input)).toEqual(calculateModelPreviewFrame(input));
  });

  it("normalizes invalid values to a finite usable frame", () => {
    const invalid = calculateModelPreviewFrame({
      radius: Number.NaN,
      aspect: 0,
      verticalFovDegrees: Number.POSITIVE_INFINITY,
      padding: -2,
    });
    const defaults = calculateModelPreviewFrame({
      radius: 1,
      aspect: 1,
      verticalFovDegrees: 35,
      padding: 1,
    });

    expect(invalid).toEqual(defaults);
    expect(Number.isFinite(invalid.distance)).toBe(true);
    expect(invalid.near).toBeGreaterThan(0);
    expect(invalid.far).toBeGreaterThan(invalid.near);
  });

  it("keeps extreme positive values finite and clip planes ordered", () => {
    const frame = calculateModelPreviewFrame({
      radius: Number.MAX_VALUE,
      aspect: Number.MIN_VALUE,
      verticalFovDegrees: Number.MIN_VALUE,
      padding: Number.MAX_VALUE,
    });

    expect(Number.isFinite(frame.distance)).toBe(true);
    expect(Number.isFinite(frame.near)).toBe(true);
    expect(Number.isFinite(frame.far)).toBe(true);
    expect(frame.near).toBeGreaterThan(0);
    expect(frame.distance).toBeGreaterThan(frame.near);
    expect(frame.far).toBeGreaterThan(frame.distance);
  });
});
