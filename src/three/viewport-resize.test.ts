import { afterEach, describe, expect, it, vi } from "vitest";
import type * as THREE from "three";
import type { CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { createViewportResizeController } from "./viewport-resize";

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeController(cameraPreviewAspect: { current: number | null }) {
  const refreshAspect = vi.fn();
  const camera = { aspect: 1, updateProjectionMatrix: vi.fn() } as unknown as THREE.PerspectiveCamera;
  const outputSurface = { resize: vi.fn(() => true) };
  const labelRenderer = { setSize: vi.fn() } as unknown as CSS2DRenderer;
  vi.stubGlobal("window", {
    devicePixelRatio: 2,
    requestAnimationFrame: vi.fn(() => 1),
    cancelAnimationFrame: vi.fn(),
  });
  const controller = createViewportResizeController({
    camera,
    cameraPreviewAspect,
    cameraGizmos: () => [{ refreshAspect }],
    host: { clientWidth: 600, clientHeight: 1000 } as HTMLElement,
    labelRenderer,
    lowResolution: { current: false },
    onResize: vi.fn(),
    renderSize: { current: null },
    outputSurface,
  });
  return { camera, controller, refreshAspect };
}

describe("viewport resize camera aspects", () => {
  it("keeps a fixed Game-view aspect on Scene-view camera frusta", () => {
    const { camera, controller, refreshAspect } = makeController({ current: 3840 / 2160 });

    controller.flush();

    expect(camera.aspect).toBeCloseTo(0.6);
    expect(refreshAspect).toHaveBeenCalledWith(16 / 9);
  });

  it("lets Free Aspect follow the live pane", () => {
    const { camera, controller, refreshAspect } = makeController({ current: null });

    controller.flush();

    expect(camera.aspect).toBeCloseTo(0.6);
    expect(refreshAspect).toHaveBeenCalledWith(0.6);
  });

  it("refreshes frusta when only the selected target aspect changes", () => {
    const targetAspect = { current: 16 / 9 };
    const { controller, refreshAspect } = makeController(targetAspect);
    controller.flush();
    targetAspect.current = 9 / 16;

    controller.flush();

    expect(refreshAspect).toHaveBeenLastCalledWith(9 / 16);
    expect(refreshAspect).toHaveBeenCalledTimes(2);
  });
});
