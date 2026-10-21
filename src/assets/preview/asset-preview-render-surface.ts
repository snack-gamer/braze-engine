import type * as THREE from "three";
import { sharedBrowserEngineLoop } from "../../runtime/browser-engine-loop";
import type { EngineFrame, EngineLoop, EngineLoopParticipant } from "../../runtime/engine-loop";
import type { ThreeWebGpuRenderSession } from "../../rendering/adapters/three-webgpu-render-session-contract";
import type { AssetPreviewDimensions } from "./asset-preview-dimensions";
import { renderPreviewScene } from "./preview-renderer-state";
import {
  createPreviewResourceLifetime,
  disposePreviewResource,
} from "./preview-resource-lifetime";

type PreviewTask = {
  scene: THREE.Scene;
  camera: THREE.Camera;
  signal: AbortSignal;
  phase: "scheduled" | "gpu";
  offered: boolean;
  resolve: (url: string | null) => void;
  onAbort: () => void;
};

export type AssetPreviewRenderSurfaceDependencies = Readonly<{
  engineLoop: EngineLoop;
  canvas: HTMLCanvasElement;
  renderScene: typeof renderPreviewScene;
  canvasToObjectUrl: (canvas: HTMLCanvasElement) => Promise<string | null>;
  disposeObjectUrl: (url: string) => void;
}>;

let nextSurfaceId = 1;

function defaultCanvasToObjectUrl(canvas: HTMLCanvasElement): Promise<string | null> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob ? URL.createObjectURL(blob) : null),
      "image/jpeg",
      0.86,
    );
  });
}

function defaultDependencies(): AssetPreviewRenderSurfaceDependencies {
  return {
    engineLoop: sharedBrowserEngineLoop(),
    canvas: document.createElement("canvas"),
    renderScene: renderPreviewScene,
    canvasToObjectUrl: defaultCanvasToObjectUrl,
    disposeObjectUrl: (url) => URL.revokeObjectURL(url),
  };
}

/** Owns one serialized hidden CanvasTarget used by generated asset previews. */
export class AssetPreviewRenderSurface {
  private readonly canvas: HTMLCanvasElement;
  private readonly surface;
  private readonly participant: EngineLoopParticipant;
  private active: PreviewTask | null = null;
  private disposed = false;

  constructor(
    private readonly session: ThreeWebGpuRenderSession,
    private readonly dependencies: AssetPreviewRenderSurfaceDependencies = defaultDependencies(),
  ) {
    this.canvas = dependencies.canvas;
    const construction = createPreviewResourceLifetime("asset preview construction resource");
    try {
      this.surface = session.registerSurface(`asset-preview:${nextSurfaceId++}`, this.canvas);
      construction.defer(() => this.surface.dispose());
      this.participant = dependencies.engineLoop.createParticipant({ render: this.onFrame });
      construction.defer(() => this.participant.dispose());
      construction.release();
    } catch (error) {
      construction.dispose();
      throw error;
    }
  }

  render(
    scene: THREE.Scene,
    camera: THREE.Camera,
    dimensions: AssetPreviewDimensions,
    signal: AbortSignal,
  ): Promise<string | null> {
    if (this.disposed || signal.aborted) return Promise.resolve(null);
    if (this.active) throw new Error("The asset preview surface accepts one serialized render at a time.");
    if (!this.surface.resize({ ...dimensions, pixelRatio: 1 })) return Promise.resolve(null);

    return new Promise((resolve) => {
      const task: PreviewTask = {
        scene,
        camera,
        signal,
        phase: "scheduled",
        offered: false,
        resolve,
        onAbort: () => {
          if (task.phase === "scheduled") this.participant.requestFrame();
        },
      };
      this.active = task;
      signal.addEventListener("abort", task.onAbort, { once: true });
      this.participant.requestFrame();
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const active = this.active;
    if (active?.phase === "scheduled") {
      disposePreviewResource("asset preview task", () => this.finish(active, null));
    }
    disposePreviewResource("asset preview frame request", () => this.participant.cancelFrame());
    disposePreviewResource("asset preview frame participant", () => this.participant.dispose());
    disposePreviewResource("asset preview render surface", () => this.surface.dispose());
  }

  private readonly onFrame = (frame: EngineFrame): void => {
    const task = this.active;
    if (!task || task.phase !== "scheduled" || this.disposed) return;
    if (task.signal.aborted && !task.offered) {
      this.finish(task, null);
      return;
    }

    try {
      const opportunity = this.session.opportunityForFrame(frame.index, frame.nowMilliseconds);
      task.offered = true;
      const disposition = this.surface.request(opportunity, (renderer, context) => {
        if (this.active !== task || task.phase !== "scheduled") return;
        if (task.signal.aborted || this.disposed) {
          this.finish(task, null);
          return;
        }
        try {
          if (!context) throw new Error("Preview rendering requires a governed retirement signal.");
          this.dependencies.renderScene(renderer, task.scene, task.camera);
          task.phase = "gpu";
          void context.retirement.then((status) => (
            status === "completed" ? this.readCanvas(task) : this.finish(task, null)
          ));
        } catch {
          this.finish(task, null);
        }
      });
      if (this.active !== task || task.phase !== "scheduled") return;
      if (disposition === "queued") this.participant.requestFrame();
      else if (disposition === "rejected") this.finish(task, null);
    } catch {
      this.finish(task, null);
    }
  };

  private async readCanvas(task: PreviewTask): Promise<void> {
    if (this.active !== task) return;
    if (this.disposed || task.signal.aborted) {
      this.finish(task, null);
      return;
    }
    try {
      const url = await this.dependencies.canvasToObjectUrl(this.canvas);
      if (url && (this.disposed || task.signal.aborted || this.active !== task)) {
        this.dependencies.disposeObjectUrl(url);
        this.finish(task, null);
        return;
      }
      this.finish(task, url);
    } catch {
      this.finish(task, null);
    }
  }

  private finish(task: PreviewTask, url: string | null): void {
    if (this.active !== task) return;
    this.active = null;
    try {
      task.signal.removeEventListener("abort", task.onAbort);
    } finally {
      task.resolve(url);
    }
  }
}
