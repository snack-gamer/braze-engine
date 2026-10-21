import * as THREE from "three";
import { TSL, WebGPURenderer, type NodeBuilder, type Renderer } from "three/webgpu";
import RenderObjects from "three/src/renderers/common/RenderObjects.js";
import type RenderObject from "three/src/renderers/common/RenderObject.js";
import { expect, it, vi } from "vitest";
import { bindObjectToGpuPose, PhysicsPoseBuffers } from "./gpu-pose";

type NodeAttribute = { node?: { attribute?: unknown } | null };
/** Public r184 builder fields omitted from the shipped NodeBuilder declarations. */
type ShaderBuilder = NodeBuilder & {
  camera: THREE.Camera;
  scene: THREE.Scene;
  attributes: NodeAttribute[];
  getBindings(): { bindings: { attribute?: unknown }[] }[];
};
type ShaderState = { storageAttributes: unknown[]; nodeAttributes: NodeAttribute[] };

function fixture() {
  const renderer = new WebGPURenderer({ canvas: {
    width: 1, height: 1, style: {}, addEventListener() {}, setAttribute() {},
  } as unknown as HTMLCanvasElement });
  vi.spyOn(renderer, "hasFeature").mockReturnValue(false);
  const mesh = new THREE.Mesh<THREE.BufferGeometry, THREE.Material>(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(), light = new THREE.DirectionalLight();
  scene.add(mesh);
  const nodes = {
    getCacheKey: () => 0,
    delete: vi.fn(),
    getForRender: (object: RenderObject): ShaderState => {
      const source = mesh.material;
      mesh.material = object.material;
      try {
        const backend = renderer.backend as unknown as {
          createNodeBuilder(mesh: THREE.Mesh, renderer: Renderer): ShaderBuilder;
        };
        const builder = backend.createNodeBuilder(mesh, renderer);
        builder.camera = camera; builder.scene = scene; builder.build();
        const bindings = builder.getBindings().flatMap((group) => group.bindings);
        return {
          storageAttributes: bindings.flatMap((binding) => "attribute" in binding ? [binding.attribute] : []),
          nodeAttributes: builder.attributes,
        };
      } finally { mesh.material = source; }
    },
  };
  const deletedBindings = vi.fn();
  type Dependencies = ConstructorParameters<typeof RenderObjects>;
  const objects = new RenderObjects(renderer, nodes as unknown as Dependencies[1], {} as Dependencies[2],
    { delete: vi.fn() } as unknown as Dependencies[3],
    { deleteForRender: deletedBindings } as unknown as Dependencies[4], {} as Dependencies[5]);
  const context = { id: 1 } as Parameters<RenderObjects["get"]>[5];
  const lights = {} as Parameters<RenderObjects["get"]>[4];
  let current: RenderObject;
  const internal = renderer as unknown as { _handleObjectFunction: (object: THREE.Mesh, material: THREE.Material) => void };
  internal._handleObjectFunction = (object, material) => {
    // The r184 source accepts null; its published declaration omits nullability.
    current = objects.get(object, material, scene, camera, lights, context,
      null as unknown as Parameters<RenderObjects["get"]>[6]);
    current.getNodeBuilderState();
  };
  const shadowState = () => {
    scene.overrideMaterial = TSL.getShadowMaterial(light);
    renderer.renderObject(mesh, scene, camera, mesh.geometry, mesh.material, null, lights);
    scene.overrideMaterial = null;
    return { object: current!, state: current!.getNodeBuilderState() as unknown as ShaderState };
  };
  const bind = (buffers: PhysicsPoseBuffers) => bindObjectToGpuPose(mesh, {
    objectId: "body", colliderId: "body-box", objectLocalOffset: [0, 0, 0], objectLocalOrientation: [0, 0, 0, 1],
    writesObjectPose: true, interpolation: "none", bodyType: "dynamic", objectPosition: [0, 0, 0], objectOrientation: [0, 0, 0, 1],
  }, 0, buffers, "#ffffff");
  return { mesh, light, bind, shadowState, deletedBindings };
}

it("retires the separate r184 shadow RenderObject before released pose buffers can be drawn again", () => {
  const { mesh, light, bind, shadowState, deletedBindings } = fixture();
  const firstBuffers = new PhysicsPoseBuffers(1), firstBinding = bind(firstBuffers);
  const first = shadowState();
  expect(first.state.storageAttributes).toEqual(expect.arrayContaining([
    firstBuffers.positionAttribute, firstBuffers.orientationAttribute,
  ]));
  // Storage uniforms are not vertex attributes owned by geometry disposal.
  expect(first.state.nodeAttributes.some((attribute) => attribute.node?.attribute === firstBuffers.positionAttribute)).toBe(false);
  firstBinding.restore(); mesh.material.needsUpdate = true;
  const stale = shadowState();
  expect(stale.object).toBe(first.object);
  expect(stale.state.storageAttributes).toContain(firstBuffers.positionAttribute);
  TSL.disposeShadowMaterial(light);
  expect(deletedBindings).toHaveBeenCalledWith(first.object);
  const authored = shadowState();
  expect(authored.object).not.toBe(first.object);
  expect(authored.state.storageAttributes).not.toContain(firstBuffers.positionAttribute);
  const secondBuffers = new PhysicsPoseBuffers(1), secondBinding = bind(secondBuffers);
  TSL.disposeShadowMaterial(light);
  const restarted = shadowState();
  expect(restarted.state.storageAttributes).toContain(secondBuffers.positionAttribute);
  expect(restarted.state.storageAttributes).not.toContain(firstBuffers.positionAttribute);
  secondBinding.restore(); TSL.disposeShadowMaterial(light); mesh.geometry.dispose(); mesh.material.dispose();
});
