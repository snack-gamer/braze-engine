import * as THREE from "three";
import {
  HalfFloatType,
  NodeMaterial,
  NodeUpdateType,
  type NodeBuilder,
  type NodeBuilderContext,
  type NodeFrame,
  type PassNode,
  QuadMesh,
  RenderTarget,
  RendererUtils,
  TempNode,
  type TextureNode,
} from "three/webgpu";
import type { SkySettings } from "../../../../types";
import type { ViewportRenderer } from "../../../../three/renderer";
import {
  applySkyMaterialSettings,
  createSkyMaterialUniforms,
  type SkyMaterialUniforms,
  type SkyNode,
} from "../../../../three/sky/material-uniforms";
import {
  calculateAtmosphericFog,
  setDefaultAtmosphereDirection,
} from "../../../../three/sky/lighting";
import { passTexture, uniform } from "../../../../three/tsl";
import { createQuarterResolutionCloudContribution } from "./quarter-resolution-cloud-material";

type RendererState = Parameters<typeof RendererUtils.restoreRendererState>[1];

/** Quarter-linear cloud contribution with persistent Three-owned pass resources. */
export class QuarterResolutionCloudNode extends TempNode {
  readonly resolutionScale = 0.25;
  readonly updateBeforeType = NodeUpdateType.FRAME;
  private readonly target = new RenderTarget(1, 1, {
    depthBuffer: false,
    type: HalfFloatType,
  });
  private readonly material = new NodeMaterial();
  private readonly quad = new QuadMesh();
  private readonly drawingBufferSize = new THREE.Vector2();
  private readonly uniforms: SkyMaterialUniforms = createSkyMaterialUniforms();
  private readonly fallbackSunDirection = new THREE.Vector3(0, 1, 0);
  private readonly resolvedSunDirection = new THREE.Vector3(0, 1, 0);
  private readonly cameraWorldMatrix: SkyNode;
  private readonly cameraProjectionMatrixInverse: SkyNode;
  private readonly textureNode: TextureNode;
  private rendererState: RendererState | null = null;
  private latestSettings: SkySettings | null = null;
  private fogSunY = Number.NaN;

  constructor(
    camera: THREE.PerspectiveCamera,
    private readonly light: THREE.DirectionalLight,
  ) {
    super("vec4");
    this.target.texture.name = "QuarterResolutionClouds";
    this.material.name = "QuarterResolutionClouds";
    this.material.depthTest = false;
    this.material.depthWrite = false;
    this.cameraWorldMatrix = uniform(camera.matrixWorld);
    this.cameraProjectionMatrixInverse = uniform(camera.projectionMatrixInverse);
    this.textureNode = passTexture(this as unknown as PassNode, this.target.texture);
    setDefaultAtmosphereDirection(this.fallbackSunDirection);
  }

  getTextureNode(): TextureNode {
    return this.textureNode;
  }

  apply(settings: SkySettings): void {
    this.latestSettings = settings;
    resolveCloudSunDirection(this.light, this.fallbackSunDirection, this.resolvedSunDirection);
    applySkyMaterialSettings(this.uniforms, settings, this.resolvedSunDirection);
    this.updateFog();
  }

  setSize(width: number, height: number): boolean {
    requireDimension(width, "width");
    requireDimension(height, "height");
    const targetWidth = Math.max(1, Math.round(width * this.resolutionScale));
    const targetHeight = Math.max(1, Math.round(height * this.resolutionScale));
    if (this.target.width === targetWidth && this.target.height === targetHeight) return false;
    this.target.setSize(targetWidth, targetHeight);
    return true;
  }

  getSize(target: THREE.Vector2): THREE.Vector2 {
    return target.set(this.target.width, this.target.height);
  }

  updateBefore(frame: NodeFrame): boolean | undefined {
    const renderer = frame.renderer as ViewportRenderer | null;
    if (!renderer) return undefined;
    renderer.getDrawingBufferSize(this.drawingBufferSize);
    this.setSize(this.drawingBufferSize.width, this.drawingBufferSize.height);
    this.updateSunAndFog();
    this.rendererState = RendererUtils.resetRendererState(
      renderer,
      this.rendererState ?? RendererUtils.saveRendererState(renderer),
    );
    try {
      this.quad.material = this.material;
      this.quad.name = "QuarterResolutionClouds";
      renderer.setRenderTarget(this.target);
      this.quad.render(renderer);
    } finally {
      RendererUtils.restoreRendererState(renderer, this.rendererState);
    }
    return undefined;
  }

  setup(builder: NodeBuilder): TextureNode {
    const contribution = createQuarterResolutionCloudContribution(
      this.uniforms,
      this.cameraWorldMatrix,
      this.cameraProjectionMatrixInverse,
    );
    const sharedContext = (builder as NodeBuilder & {
      getSharedContext: () => NodeBuilderContext;
    }).getSharedContext();
    this.material.fragmentNode = contribution.context(sharedContext);
    this.material.needsUpdate = true;
    return this.textureNode;
  }

  dispose(): void {
    this.target.dispose();
    this.material.dispose();
  }

  private updateSunAndFog(): void {
    resolveCloudSunDirection(this.light, this.fallbackSunDirection, this.resolvedSunDirection);
    this.uniforms.sunDirection.value.copy(this.resolvedSunDirection);
    if (Math.abs(this.resolvedSunDirection.y - this.fogSunY) > 1e-6) this.updateFog();
  }

  private updateFog(): void {
    if (!this.latestSettings) return;
    const fog = calculateAtmosphericFog(this.latestSettings, this.resolvedSunDirection.y);
    this.uniforms.atmosphericFogColor.value.copy(fog.color);
    this.uniforms.atmosphericFogDensity.value = fog.density;
    this.fogSunY = this.resolvedSunDirection.y;
  }
}

export function resolveCloudSunDirection(
  light: THREE.DirectionalLight,
  fallback: THREE.Vector3,
  target: THREE.Vector3,
): THREE.Vector3 {
  target.copy(fallback);
  if (!light.visible || light.intensity <= 0.001) return target.normalize();
  target.subVectors(light.position, light.target.position);
  return target.lengthSq() > 1e-8 ? target.normalize() : target.copy(fallback).normalize();
}

function requireDimension(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`Cloud target ${name} must be a positive finite number.`);
  }
}
