import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { ViewportRenderer } from "../../three/renderer";
import { renderPreviewScene } from "./preview-renderer-state";

describe("renderPreviewScene", () => {
  it("restores shared image, clear, and render-target state when rendering fails", () => {
    let clearColor = new THREE.Color(0x123456);
    let clearAlpha = 0.4;
    let renderTarget: unknown = { name: "previous-target" };
    const failure = new Error("preview render failed");
    const renderer = {
      outputColorSpace: THREE.LinearSRGBColorSpace,
      toneMapping: THREE.NoToneMapping,
      toneMappingExposure: 2.5,
      autoClear: false,
      getClearColor: vi.fn((target: THREE.Color) => target.copy(clearColor)),
      getClearAlpha: vi.fn(() => clearAlpha),
      setClearColor: vi.fn((color: THREE.ColorRepresentation, alpha = 1) => {
        clearColor = new THREE.Color(color);
        clearAlpha = alpha;
      }),
      getRenderTarget: vi.fn(() => renderTarget),
      getActiveCubeFace: vi.fn(() => 2),
      getActiveMipmapLevel: vi.fn(() => 3),
      setRenderTarget: vi.fn((next: unknown) => { renderTarget = next; }),
      render: vi.fn(() => {
        expect(renderer.outputColorSpace).toBe(THREE.SRGBColorSpace);
        expect(renderer.toneMapping).toBe(THREE.ACESFilmicToneMapping);
        expect(renderer.toneMappingExposure).toBe(1.05);
        expect(renderer.autoClear).toBe(true);
        throw failure;
      }),
    } as unknown as ViewportRenderer;

    expect(() => renderPreviewScene(renderer, new THREE.Scene(), new THREE.Camera()))
      .toThrow(failure);
    expect(renderer.outputColorSpace).toBe(THREE.LinearSRGBColorSpace);
    expect(renderer.toneMapping).toBe(THREE.NoToneMapping);
    expect(renderer.toneMappingExposure).toBe(2.5);
    expect(renderer.autoClear).toBe(false);
    expect(clearColor.getHex()).toBe(0x123456);
    expect(clearAlpha).toBe(0.4);
    expect(renderTarget).toEqual({ name: "previous-target" });
    expect(renderer.setRenderTarget).toHaveBeenLastCalledWith(
      { name: "previous-target" },
      2,
      3,
    );
  });
});
