import * as THREE from "three";
import {
  HalfFloatType,
  NodeMaterial,
  NodeUpdateType,
  RedFormat,
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
import {
  Fn,
  Loop,
  float,
  interleavedGradientNoise,
  length,
  max,
  min,
  oneMinus,
  passTexture,
  pow,
  saturate,
  screenCoordinate,
  smoothstep,
  step,
  uniform,
  uint,
  uv,
  vec3,
  vec4,
} from "../../../three/tsl";
import type { ViewportRenderer } from "../../../three/renderer";
import type { GodraysParameters } from "./godrays-parameters";

type RendererState = Parameters<typeof RendererUtils.restoreRendererState>[1];
type RendererStateOperations = Pick<
  typeof RendererUtils,
  "resetRendererState" | "restoreRendererState" | "saveRendererState"
>;

/** Half-resolution R16F radial integration over a prefiltered scalar source mask. */
export class RadialGodraysNode extends TempNode {
  readonly resolutionScale = 0.5;
  readonly updateBeforeType = NodeUpdateType.FRAME;
  private readonly target = new RenderTarget(1, 1, {
    depthBuffer: false,
    format: RedFormat,
    type: HalfFloatType,
  });
  private readonly material = new NodeMaterial();
  private readonly quad = new QuadMesh();
  private readonly size = new THREE.Vector2();
  private readonly textureNode = passTexture(this as unknown as PassNode, this.target.texture);
  private readonly sunUv = uniform(new THREE.Vector2(0.5, 0.5));
  private readonly visibility = uniform(0);
  private readonly samples = uniform(uint(20));
  private readonly density = uniform(0.45);
  private readonly decay = uniform(0.94);
  private readonly strength = uniform(0.1);
  private rendererState: RendererState | null = null;
  private readonly sunDirection = new THREE.Vector3();
  private readonly sunPoint = new THREE.Vector3();
  private readonly projectedSun = new THREE.Vector3();
  private readonly cameraForward = new THREE.Vector3();

  constructor(
    private readonly sourceMaskNode: TextureNode,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly light: THREE.DirectionalLight,
    private readonly rendererStateOperations: RendererStateOperations = RendererUtils,
  ) {
    super("vec4");
    this.target.texture.name = "RadialGodrays";
    this.material.name = "RadialGodrays";
    this.material.depthTest = false;
    this.material.depthWrite = false;
  }

  getTextureNode() {
    return this.textureNode;
  }

  apply(parameters: GodraysParameters): void {
    this.samples.value = parameters.raymarchSteps;
    this.density.value = parameters.radialDensity;
    this.decay.value = parameters.decay;
    this.strength.value = parameters.strength;
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
    this.rendererState = this.rendererStateOperations.resetRendererState(
      renderer,
      this.rendererState ?? this.rendererStateOperations.saveRendererState(renderer),
    );
    try {
      renderer.getDrawingBufferSize(this.size);
      this.setSize(this.size.width, this.size.height);
      this.updateSunProjection();
      this.quad.material = this.material;
      this.quad.name = "RadialGodrays";
      renderer.setRenderTarget(this.target);
      this.quad.render(renderer);
    } finally {
      this.rendererStateOperations.restoreRendererState(renderer, this.rendererState);
    }
    return undefined;
  }

  setup(builder: NodeBuilder) {
    const sourceUv = uv();
    const contribution = Fn(() => {
      const sampleCount = float(this.samples).toConst();
      const delta = sourceUv.sub(this.sunUv).mul(this.density.div(sampleCount)).toVar();
      const jitter = interleavedGradientNoise(screenCoordinate).toVar();
      const coordinate = sourceUv.sub(delta.mul(jitter)).toVar();
      const illumination = float(1).toVar();
      const accumulated = float(0).toVar();
      const possible = float(0).toVar();

      Loop({ start: uint(0), end: this.samples, type: "uint", condition: "<" }, () => {
        coordinate.subAssign(delta);
        const valid = step(float(0), coordinate.x)
          .mul(step(coordinate.x, float(1)))
          .mul(step(float(0), coordinate.y))
          .mul(step(coordinate.y, float(1)));
        const source = this.sourceMaskNode.sample(saturate(coordinate)).r.mul(valid);
        accumulated.addAssign(source.mul(illumination));
        possible.addAssign(illumination);
        illumination.mulAssign(this.decay);
      });

      const radialFade = oneMinus(smoothstep(
        float(0.1),
        float(1.85),
        length(sourceUv.sub(this.sunUv)),
      ));
      const normalized = accumulated.div(max(possible, float(1e-4)));
      const shaped = pow(saturate(normalized), float(1.25));
      const rays = min(float(1), shaped.mul(radialFade).mul(this.strength).mul(this.visibility));
      return vec4(vec3(rays), float(1));
    });
    const sharedContext = (builder as NodeBuilder & {
      getSharedContext: () => NodeBuilderContext;
    }).getSharedContext();
    this.material.fragmentNode = contribution().context(sharedContext);
    this.material.needsUpdate = true;
    return this.textureNode;
  }

  dispose(): void {
    this.target.dispose();
    this.material.dispose();
  }

  private updateSunProjection(): void {
    this.sunDirection.subVectors(this.light.position, this.light.target.position);
    if (this.sunDirection.lengthSq() < 0.0001) this.sunDirection.set(0.45, 0.75, 0.5);
    this.sunDirection.normalize();
    this.sunPoint.copy(this.camera.position).add(this.sunDirection);
    this.projectedSun.copy(this.sunPoint).project(this.camera);
    const x = this.projectedSun.x * 0.5 + 0.5;
    const y = this.projectedSun.y * 0.5 + 0.5;
    this.sunUv.value.set(x, y);
    this.camera.getWorldDirection(this.cameraForward);
    const viewFade = THREE.MathUtils.smoothstep(this.sunDirection.dot(this.cameraForward), 0.02, 0.18);
    const edge = Math.min(x, y, 1 - x, 1 - y);
    const edgeFade = THREE.MathUtils.smoothstep(edge, -0.85, 0.1);
    const inExtendedFrame = x >= -0.85 && x <= 1.85 && y >= -0.85 && y <= 1.85;
    this.visibility.value = this.light.visible
      && this.light.intensity > 0.001
      && this.sunDirection.y > -0.04
      && inExtendedFrame
      ? viewFade * edgeFade
      : 0;
  }
}

function requireDimension(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`Godray target ${name} must be a positive finite number.`);
  }
}
