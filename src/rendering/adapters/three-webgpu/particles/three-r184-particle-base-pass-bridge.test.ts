import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import {
  installThreeR184ParticleBasePassBridge,
  type ThreeR184ParticleCompatibilityDiagnostic,
} from "./three-r184-particle-base-pass-bridge";

function compatibleRenderer() {
  const context = {};
  const currentPass = {
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    setVertexBuffer: vi.fn(),
    setIndexBuffer: vi.fn(),
    drawIndirect: vi.fn(),
    drawIndexedIndirect: vi.fn(),
  };
  const data: Record<string, unknown> = {
    currentPass,
    currentSets: { attributes: { position: 1 }, bindingGroups: [2], index: 3, pipeline: 4 },
  };
  const get = vi.fn(() => data);
  const renderer = {
    _currentRenderContext: context,
    backend: {
      get,
      utils: {
        getCurrentColorFormats: vi.fn(() => ["rgba16float", "rgba8unorm"]),
        getCurrentDepthStencilFormat: vi.fn(() => "depth24plus"),
        getSampleCountRenderContext: vi.fn(() => 4),
      },
    },
  };
  return { currentPass, data, get, renderer };
}

function invokeBridge(scene: THREE.Scene, renderer: unknown, camera: THREE.Camera): THREE.Mesh {
  const hook = scene.getObjectByName("Particle Base-Pass Compatibility Bridge") as THREE.Mesh;
  hook.onAfterRender(
    renderer as never,
    scene,
    camera,
    hook.geometry,
    hook.material as THREE.Material,
    new THREE.Group(),
  );
  return hook;
}

describe("Three r184 particle base-pass compatibility bridge", () => {
  it("records into the primary camera pass with its exact MRT, depth, and sample state", () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const { data, renderer } = compatibleRenderer();
    const renderToPass = vi.fn();
    const bridge = installThreeR184ParticleBasePassBridge({
      scene,
      camera,
      renderer: renderer as never,
      particles: { renderToPass },
    });
    bridge.setEnabled(true);

    const hook = invokeBridge(scene, renderer, camera);

    expect(renderToPass).toHaveBeenCalledWith(
      renderer.backend.get().currentPass,
      camera,
      {
        colorFormats: ["rgba16float", "rgba8unorm"],
        depthFormat: "depth24plus",
        sampleCount: 4,
      },
    );
    expect(data.currentSets).toEqual({ attributes: {}, bindingGroups: [], index: null, pipeline: null });
    expect(hook.userData.renderPassHook).toBe(true);
    expect(hook.userData.particleBasePassCompatibility).toBe("three-r184");

    bridge.dispose();
    bridge.dispose();
    expect(scene.getObjectByName(hook.name)).toBeUndefined();
  });

  it("does not inject particles into reflection or shadow camera passes", () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const { get, renderer } = compatibleRenderer();
    const renderToPass = vi.fn();
    const bridge = installThreeR184ParticleBasePassBridge({
      scene,
      camera,
      renderer: renderer as never,
      particles: { renderToPass },
    });
    bridge.setEnabled(true);

    invokeBridge(scene, renderer, new THREE.PerspectiveCamera());

    expect(get).not.toHaveBeenCalled();
    expect(renderToPass).not.toHaveBeenCalled();
  });

  it("reports an incompatible live shape once and disables the hook without stranding Three's pass", () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const { renderer } = compatibleRenderer();
    renderer.backend.get = vi.fn(() => ({
      currentPass: null,
      currentSets: { attributes: {}, bindingGroups: [], index: null, pipeline: null },
    }));
    const diagnostics: ThreeR184ParticleCompatibilityDiagnostic[] = [];
    const bridge = installThreeR184ParticleBasePassBridge({
      scene,
      camera,
      renderer: renderer as never,
      particles: { renderToPass: vi.fn() },
      reportDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });
    bridge.setEnabled(true);

    expect(() => invokeBridge(scene, renderer, camera)).not.toThrow();
    const hook = scene.getObjectByName("Particle Base-Pass Compatibility Bridge") as THREE.Mesh;
    expect(hook.visible).toBe(false);
    bridge.setEnabled(true);
    expect(hook.visible).toBe(false);
    expect(() => invokeBridge(scene, renderer, camera)).not.toThrow();
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      code: "THREE_R184_PARTICLE_PASS_INCOMPATIBLE",
      expectedRevision: "184",
      actualRevision: THREE.REVISION,
    });
  });

  it("keeps the compatibility render object out of no-particle frames", () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const { renderer } = compatibleRenderer();
    const bridge = installThreeR184ParticleBasePassBridge({
      scene,
      camera,
      renderer: renderer as never,
      particles: { renderToPass: vi.fn() },
    });
    const hook = scene.getObjectByName("Particle Base-Pass Compatibility Bridge") as THREE.Mesh;

    expect(hook.visible).toBe(false);
    bridge.setEnabled(true);
    expect(hook.visible).toBe(true);
    bridge.setEnabled(false);
    expect(hook.visible).toBe(false);
  });

  it("rejects a renderer without the pinned backend contract during installation", () => {
    const diagnostics: ThreeR184ParticleCompatibilityDiagnostic[] = [];
    expect(() => installThreeR184ParticleBasePassBridge({
      scene: new THREE.Scene(),
      camera: new THREE.PerspectiveCamera(),
      renderer: { _currentRenderContext: null, backend: {} } as never,
      particles: { renderToPass: vi.fn() },
      reportDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    })).toThrow(/renderer\.backend\.get is unavailable/);
    expect(diagnostics).toHaveLength(1);
  });
});
