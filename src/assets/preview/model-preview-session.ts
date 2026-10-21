import * as THREE from "three";
import type {
  ThreeWebGpuRenderSession,
  ThreeWebGpuSessionSurface,
} from "../../rendering/adapters/three-webgpu-render-session-contract";
import { sharedBrowserEngineLoop } from "../../runtime/browser-engine-loop";
import type { EngineFrame, EngineLoopParticipant } from "../../runtime/engine-loop";
import { createAssetCache } from "../../three/assets";
import {
  createModelPreviewStage,
  type ModelPreviewStage,
} from "./model-preview-stage";
import type { ModelPreviewExtension } from "./model-preview-extension";
import type { EditorGrid } from "../../three/editor-grid";
import { calculateModelPreviewGridFrame } from "./model-preview-grid-frame";
import { renderPreviewScene } from "./preview-renderer-state";
import {
  loadModelPreviewContent,
  releaseModelPreviewContent,
  type ModelPreviewContent,
} from "./model-preview-content";
import {
  ModelPreviewNavigation,
  type ModelPreviewNavigationOptions,
  type ModelPreviewViewState,
} from "./model-preview-navigation";
import {
  createPreviewResourceLifetime,
  disposePreviewResource,
} from "./preview-resource-lifetime";

export type ModelPreviewStatus = "loading" | "ready" | "failed";

export type { ModelPreviewViewState } from "./model-preview-navigation";

type ModelPreviewSessionCallbacks = {
  onStatus: (status: ModelPreviewStatus) => void;
  onViewState: (view: ModelPreviewViewState) => void;
};

export type ModelPreviewSessionDependencies = Readonly<{
  createStage: (canvas: HTMLCanvasElement) => ModelPreviewStage;
  createFrameParticipant: (render: (frame: EngineFrame) => void) => EngineLoopParticipant;
  createNavigation: (options: ModelPreviewNavigationOptions) => ModelPreviewNavigation;
}>;

const DEFAULT_DEPENDENCIES: ModelPreviewSessionDependencies = Object.freeze({
  createStage: createModelPreviewStage,
  createFrameParticipant: (render) => sharedBrowserEngineLoop().createParticipant({ render }),
  createNavigation: (options) => new ModelPreviewNavigation(options),
});

let nextModelPreviewSurfaceId = 1;

/** Owns one interactive Inspector canvas and every resource attached to it. */
export class ModelPreviewSession {
  private readonly canvas: HTMLCanvasElement;
  private readonly callbacks: ModelPreviewSessionCallbacks;
  private readonly renderSession: ThreeWebGpuRenderSession;
  private readonly renderSurface: ThreeWebGpuSessionSurface;
  private readonly rendererReady: Promise<void>;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly grid: EditorGrid;
  private readonly stage: ModelPreviewStage;
  private readonly frameParticipant: EngineLoopParticipant;
  private readonly navigation: ModelPreviewNavigation;
  private readonly assetCache = createAssetCache();
  private readonly extension: ModelPreviewExtension | null;
  private content: ModelPreviewContent | null = null;
  private loadGeneration = 0;
  private disposed = false;
  private rendererInitialized = false;

  constructor(
    canvas: HTMLCanvasElement,
    callbacks: ModelPreviewSessionCallbacks,
    renderSession: ThreeWebGpuRenderSession,
    extension?: ModelPreviewExtension,
    dependencies: ModelPreviewSessionDependencies = DEFAULT_DEPENDENCIES,
  ) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.renderSession = renderSession;
    this.extension = extension ?? null;
    const construction = createPreviewResourceLifetime("model preview construction resource");
    construction.defer(() => this.assetCache.dispose());
    try {
      const stage = dependencies.createStage(canvas);
      this.stage = stage;
      this.scene = stage.scene;
      this.camera = stage.camera;
      this.grid = stage.grid;
      construction.defer(() => stage.dispose());
      this.renderSurface = renderSession.registerSurface(
        `model-preview:${nextModelPreviewSurfaceId++}`,
        canvas,
      );
      construction.defer(() => this.renderSurface.dispose());
      this.frameParticipant = dependencies.createFrameParticipant(this.render);
      construction.defer(() => this.frameParticipant.dispose());
      construction.defer(() => this.frameParticipant.cancelFrame());
      this.navigation = dependencies.createNavigation({
        canvas,
        camera: this.camera,
        controls: stage.controls,
        resizeSurface: (resolution) => this.renderSurface.resize({
          width: resolution.cssWidth,
          height: resolution.cssHeight,
          pixelRatio: resolution.pixelRatio,
        }),
        requestRender: () => this.requestRender(),
        onViewState: callbacks.onViewState,
        onFailure: () => callbacks.onStatus("failed"),
      });
      construction.defer(() => this.navigation.dispose());
      this.rendererReady = renderSession.ready.then(() => {
        if (!this.disposed) this.rendererInitialized = true;
      });
      construction.release();
    } catch (error) {
      this.disposed = true;
      construction.dispose();
      throw error;
    }
  }

  async load(url: string, revision?: string | null): Promise<void> {
    const generation = ++this.loadGeneration;
    this.releaseContent();
    this.navigation.setBounds(null);
    this.callbacks.onStatus("loading");
    try {
      await this.rendererReady;
    } catch {
      if (!this.disposed && generation === this.loadGeneration) this.callbacks.onStatus("failed");
      return;
    }
    if (this.disposed || generation !== this.loadGeneration) return;
    const content = await loadModelPreviewContent({
      assetCache: this.assetCache,
      canvas: this.canvas,
      scene: this.scene,
      camera: this.camera,
      extension: this.extension,
      url,
      revision,
      requestRender: () => this.requestRender(),
      isActive: () => !this.disposed && generation === this.loadGeneration,
    });
    if (!content) {
      if (!this.disposed && generation === this.loadGeneration) this.callbacks.onStatus("failed");
      return;
    }
    if (this.disposed || generation !== this.loadGeneration) {
      releaseModelPreviewContent(this.scene, this.extension, content);
      return;
    }

    this.content = content;
    this.navigation.setBounds(content.bounds);
    const size = content.box.getSize(new THREE.Vector3());
    if (content.box.isEmpty()) {
      this.releaseContent();
      this.callbacks.onStatus("failed");
      return;
    }
    const gridFrame = calculateModelPreviewGridFrame({
      minimumY: content.box.min.y,
      width: size.x,
      height: size.y,
      depth: size.z,
    });
    this.grid.setExtent(gridFrame.size, gridFrame.cellSize);
    this.grid.setGroundHeight(gridFrame.groundHeight);
    this.navigation.resetView();
    this.callbacks.onStatus("ready");
    this.requestRender();
  }

  resetView(): void {
    this.navigation.resetView();
  }

  setGridVisible(visible: boolean): void {
    if (this.disposed) return;
    this.grid.setVisible(visible);
    this.requestRender();
  }

  setGridOpacity(opacity: number): void {
    if (this.disposed) return;
    this.grid.setOpacity(opacity);
    this.requestRender();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.loadGeneration += 1;
    disposePreviewResource("model preview navigation", () => this.navigation.dispose());
    disposePreviewResource("model preview frame request", () => this.frameParticipant.cancelFrame());
    disposePreviewResource("model preview frame participant", () => this.frameParticipant.dispose());
    disposePreviewResource("model preview content", () => this.releaseContent());
    disposePreviewResource("model preview extension", () => this.extension?.dispose());
    disposePreviewResource("model preview render surface", () => this.renderSurface.dispose());
    disposePreviewResource("model preview stage", () => this.stage.dispose());
    disposePreviewResource("model preview asset cache", () => this.assetCache.dispose());
  }

  private requestRender(): void {
    if (!this.disposed) this.frameParticipant.requestFrame();
  }

  private readonly render = (frame: EngineFrame): void => {
    if (this.disposed || !this.rendererInitialized) return;
    try {
      const opportunity = this.renderSession.opportunityForFrame(frame.index, frame.nowMilliseconds);
      const disposition = this.renderSurface.request(opportunity, (renderer) => {
        if (this.disposed) return;
        const continueRendering = this.extension?.render?.(frame) === true;
        renderPreviewScene(renderer, this.scene, this.camera);
        if (continueRendering) this.requestRender();
      });
      if (disposition === "queued") this.requestRender();
      else if (disposition === "rejected") this.callbacks.onStatus("failed");
    } catch {
      this.callbacks.onStatus("failed");
    }
  };

  private releaseContent(): void {
    if (!this.content) return;
    const content = this.content;
    this.content = null;
    releaseModelPreviewContent(this.scene, this.extension, content);
  }
}
