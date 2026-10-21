import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ThreeWebGpuRenderSession,
  ThreeWebGpuSessionSurface,
} from "../../rendering/adapters/three-webgpu-render-session-contract";
import type { EngineLoopParticipant } from "../../runtime/engine-loop";
import type { EditorGrid } from "../../three/editor-grid";
import { ModelPreviewNavigation } from "./model-preview-navigation";
import {
  ModelPreviewSession,
  type ModelPreviewSessionDependencies,
} from "./model-preview-session";
import type { ModelPreviewStage } from "./model-preview-stage";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ModelPreviewSession", () => {
  it("rolls back navigation and upstream resources in reverse order when construction fails", () => {
    const events: string[] = [];
    const constructionFailure = new Error("render session readiness failed");
    const cleanupFailure = new Error("cleanup failed");
    const report = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const canvas = {
      addEventListener: vi.fn((type: string) => events.push(`canvas-add:${type}`)),
      removeEventListener: vi.fn((type: string) => events.push(`canvas-remove:${type}`)),
      focus: vi.fn(),
      getBoundingClientRect: vi.fn(() => ({ width: 160, height: 90 } as DOMRect)),
    } as unknown as HTMLCanvasElement;
    const controls = {
      addEventListener: vi.fn((type: string) => events.push(`controls-add:${type}`)),
      removeEventListener: vi.fn((type: string) => events.push(`controls-remove:${type}`)),
      listenToKeyEvents: vi.fn(() => events.push("controls-listen-keys")),
      stopListenToKeyEvents: vi.fn(() => events.push("controls-stop-keys")),
      dispose: vi.fn(() => events.push("controls-dispose")),
    } as unknown as OrbitControls;
    const grid = {
      dispose: vi.fn(() => events.push("grid-dispose")),
    } as unknown as EditorGrid;
    const stage: ModelPreviewStage = {
      scene: new THREE.Scene(),
      camera: new THREE.PerspectiveCamera(),
      controls,
      grid,
      dispose: vi.fn(() => {
        controls.dispose();
        grid.dispose();
        events.push("scene-clear");
      }),
    };
    const surface = {
      name: "model-preview:construction-failure",
      configure: vi.fn(() => true),
      request: vi.fn(() => "rejected" as const),
      resize: vi.fn(() => {
        events.push("surface-resize");
        return true;
      }),
      dispose: vi.fn(() => events.push("surface-dispose")),
    } satisfies ThreeWebGpuSessionSurface;
    const participant: EngineLoopParticipant = {
      requestFrame: vi.fn(() => events.push("participant-request")),
      cancelFrame: vi.fn(() => {
        events.push("participant-cancel");
        throw cleanupFailure;
      }),
      dispose: vi.fn(() => events.push("participant-dispose")),
    };
    const renderSession = {
      get ready(): Promise<void> {
        events.push("read-ready");
        throw constructionFailure;
      },
      registerSurface: vi.fn(() => {
        events.push("surface-register");
        return surface;
      }),
    } as unknown as ThreeWebGpuRenderSession;
    const dependencies: ModelPreviewSessionDependencies = {
      createStage: vi.fn(() => {
        events.push("stage-create");
        return stage;
      }),
      createFrameParticipant: vi.fn(() => {
        events.push("participant-create");
        return participant;
      }),
      createNavigation: vi.fn((options) => {
        events.push("navigation-create");
        return new ModelPreviewNavigation(options);
      }),
    };
    class TestResizeObserver {
      constructor(_callback: ResizeObserverCallback) {
        events.push("observer-create");
      }

      observe(): void {
        events.push("observer-observe");
      }

      unobserve(): void {}

      disconnect(): void {
        events.push("observer-disconnect");
        throw cleanupFailure;
      }
    }
    vi.stubGlobal("window", { devicePixelRatio: 1 });
    vi.stubGlobal("ResizeObserver", TestResizeObserver);

    expect(() => new ModelPreviewSession(
      canvas,
      { onStatus: vi.fn(), onViewState: vi.fn() },
      renderSession,
      undefined,
      dependencies,
    )).toThrow(constructionFailure);

    const cleanupStart = events.indexOf("observer-disconnect");
    expect(cleanupStart).toBeGreaterThan(-1);
    expect(events.slice(cleanupStart)).toEqual([
      "observer-disconnect",
      "canvas-remove:keydown",
      "canvas-remove:pointerdown",
      "controls-stop-keys",
      "controls-remove:change",
      "controls-remove:end",
      "controls-remove:start",
      "participant-cancel",
      "participant-dispose",
      "surface-dispose",
      "controls-dispose",
      "grid-dispose",
      "scene-clear",
    ]);
    expect(report).toHaveBeenCalledTimes(2);
    report.mockRestore();
  });

  it("contains normal disposal failures and releases every later owner once", () => {
    const events: string[] = [];
    const cleanupFailure = new Error("cleanup failed");
    const report = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const canvas = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn((type: string) => events.push(`canvas-remove:${type}`)),
      focus: vi.fn(),
      getBoundingClientRect: vi.fn(() => ({ width: 160, height: 90 } as DOMRect)),
    } as unknown as HTMLCanvasElement;
    const controls = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn((type: string) => events.push(`controls-remove:${type}`)),
      listenToKeyEvents: vi.fn(),
      stopListenToKeyEvents: vi.fn(() => events.push("controls-stop-keys")),
      dispose: vi.fn(() => events.push("controls-dispose")),
    } as unknown as OrbitControls;
    const grid = {
      dispose: vi.fn(() => events.push("grid-dispose")),
    } as unknown as EditorGrid;
    const stage: ModelPreviewStage = {
      scene: new THREE.Scene(),
      camera: new THREE.PerspectiveCamera(),
      controls,
      grid,
      dispose: vi.fn(() => {
        controls.dispose();
        grid.dispose();
        events.push("scene-clear");
      }),
    };
    const surface = {
      name: "model-preview:normal-disposal",
      configure: vi.fn(() => true),
      request: vi.fn(() => "rejected" as const),
      resize: vi.fn(() => true),
      dispose: vi.fn(() => {
        events.push("surface-dispose");
        throw cleanupFailure;
      }),
    } satisfies ThreeWebGpuSessionSurface;
    const participant: EngineLoopParticipant = {
      requestFrame: vi.fn(),
      cancelFrame: vi.fn(() => {
        events.push("participant-cancel");
        throw cleanupFailure;
      }),
      dispose: vi.fn(() => events.push("participant-dispose")),
    };
    const extension = {
      attach: vi.fn(),
      detach: vi.fn(),
      dispose: vi.fn(() => {
        events.push("extension-dispose");
        throw cleanupFailure;
      }),
    };
    class TestResizeObserver {
      constructor(_callback: ResizeObserverCallback) {}

      observe(): void {}

      unobserve(): void {}

      disconnect(): void {
        events.push("observer-disconnect");
        throw cleanupFailure;
      }
    }
    vi.stubGlobal("window", { devicePixelRatio: 1 });
    vi.stubGlobal("ResizeObserver", TestResizeObserver);
    const session = new ModelPreviewSession(
      canvas,
      { onStatus: vi.fn(), onViewState: vi.fn() },
      {
        ready: Promise.resolve(),
        registerSurface: vi.fn(() => surface),
      } as unknown as ThreeWebGpuRenderSession,
      extension,
      {
        createStage: vi.fn(() => stage),
        createFrameParticipant: vi.fn(() => participant),
        createNavigation: vi.fn((options) => new ModelPreviewNavigation(options)),
      },
    );

    session.dispose();
    session.dispose();

    expect(events).toEqual([
      "observer-disconnect",
      "canvas-remove:keydown",
      "canvas-remove:pointerdown",
      "controls-stop-keys",
      "controls-remove:change",
      "controls-remove:end",
      "controls-remove:start",
      "participant-cancel",
      "participant-dispose",
      "extension-dispose",
      "surface-dispose",
      "controls-dispose",
      "grid-dispose",
      "scene-clear",
    ]);
    expect(report).toHaveBeenCalledTimes(4);
    report.mockRestore();
  });
});
