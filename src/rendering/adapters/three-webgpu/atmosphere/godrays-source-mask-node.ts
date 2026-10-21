import * as THREE from "three";
import {
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
  UnsignedByteType,
  type TextureNode,
} from "three/webgpu";
import type { ViewportRenderer } from "../../../../three/renderer";
import {
  Fn,
  dot,
  float,
  oneMinus,
  passTexture,
  smoothstep,
  step,
  uv,
  vec3,
  vec4,
} from "../../../../three/tsl";

type RendererState = Parameters<typeof RendererUtils.restoreRendererState>[1];

/** Builds one half-resolution R8 sky/luminance mask for radial godray integration. */
export class GodraysSourceMaskNode extends TempNode {
  readonly resolutionScale = 0.5;
  readonly updateBeforeType = NodeUpdateType.FRAME;
  private readonly target = new RenderTarget(1, 1, {
    depthBuffer: false,
    format: RedFormat,
    type: UnsignedByteType,
  });
  private readonly material = new NodeMaterial();
  private readonly quad = new QuadMesh();
  private readonly drawingBufferSize = new THREE.Vector2();
  private readonly textureNode = passTexture(this as unknown as PassNode, this.target.texture);
  private rendererState: RendererState | null = null;

  constructor(
    private readonly colorNode: TextureNode,
    private readonly depthNode: TextureNode,
    private readonly reversedDepthBuffer: boolean,
  ) {
    super("vec4");
    this.target.texture.name = "GodraysSourceMask";
    this.material.name = "GodraysSourceMask";
    this.material.depthTest = false;
    this.material.depthWrite = false;
  }

  getTextureNode(): TextureNode {
    return this.textureNode;
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
    this.rendererState = RendererUtils.resetRendererState(
      renderer,
      this.rendererState ?? RendererUtils.saveRendererState(renderer),
    );
    try {
      this.quad.material = this.material;
      this.quad.name = "GodraysSourceMask";
      renderer.setRenderTarget(this.target);
      this.quad.render(renderer);
    } finally {
      RendererUtils.restoreRendererState(renderer, this.rendererState);
    }
    return undefined;
  }

  setup(builder: NodeBuilder): TextureNode {
    const sourceMask = Fn(() => {
      const sourceUv = uv();
      const color = this.colorNode.sample(sourceUv).rgb;
      const depth = this.depthNode.sample(sourceUv).r;
      const clearSky = this.reversedDepthBuffer
        ? oneMinus(step(float(0.000001), depth))
        : step(float(0.999999), depth);
      const luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      const source = smoothstep(float(0.62), float(0.88), luma).mul(clearSky);
      return vec4(vec3(source), float(1));
    });
    const sharedContext = (builder as NodeBuilder & {
      getSharedContext: () => NodeBuilderContext;
    }).getSharedContext();
    this.material.fragmentNode = sourceMask().context(sharedContext);
    this.material.needsUpdate = true;
    return this.textureNode;
  }

  dispose(): void {
    this.target.dispose();
    this.material.dispose();
  }
}

function requireDimension(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`Godray source target ${name} must be a positive finite number.`);
  }
}
