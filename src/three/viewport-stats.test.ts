import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { ViewportRenderer } from "./renderer";
import {
  collectVisibleGeometryStats,
  createViewportStatsSampler,
  formatBytes,
  formatCompactCount,
  readHeapMemory,
} from "./viewport-stats";

describe("viewport statistics", () => {
  it("counts visible meshes, instances, and submitted vertices", () => {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry()));

    const instanced = new THREE.InstancedMesh(
      new THREE.BoxGeometry(),
      new THREE.MeshBasicMaterial(),
      3,
    );
    root.add(instanced);

    const hidden = new THREE.Group();
    hidden.visible = false;
    hidden.add(new THREE.Mesh(new THREE.BoxGeometry()));
    root.add(hidden);

    expect(collectVisibleGeometryStats(root)).toEqual({
      meshes: 2,
      instances: 4,
      vertices: 96,
    });
  });

  it("reads heap memory when the browser exposes it", () => {
    const source = {
      memory: {
        usedJSHeapSize: 48 * 1024 ** 2,
        jsHeapSizeLimit: 2 * 1024 ** 3,
      },
    } as unknown as Performance;

    expect(readHeapMemory(source)).toEqual({
      usedBytes: 48 * 1024 ** 2,
      limitBytes: 2 * 1024 ** 3,
    });
    expect(readHeapMemory({} as Performance)).toBeNull();
  });

  it("formats compact counts and binary memory without losing units", () => {
    expect(formatCompactCount(999)).toBe("999");
    expect(formatCompactCount(12_400)).toBe("12k");
    expect(formatCompactCount(2_169_998)).toBe("2.2M");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(24 * 1024 ** 2)).toBe("24.0 MB");
  });

  it("samples renderer and scene metrics on a throttled interval", () => {
    const renderer = {
      domElement: { width: 1920, height: 1080 },
      getPixelRatio: () => 2,
      info: {
        render: { triangles: 1200, calls: 42, drawCalls: 7 },
        memory: {
          geometries: 3,
          textures: 2,
          total: 96 * 1024 ** 2,
          texturesSize: 72 * 1024 ** 2,
          renderTargets: 4,
        },
      },
    } as unknown as ViewportRenderer;
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry()));
    const sampler = createViewportStatsSampler(renderer, root, "webgpu");

    expect(sampler.sample(0)).toMatchObject({
      meshes: 1,
      outputWidth: 1920,
      outputHeight: 1080,
    });
    expect(sampler.sample(100)).toBeNull();
    expect(sampler.sample(200)).toBeNull();
    const snapshot = sampler.sample(250, { triangles: 900, drawCalls: 5 });

    expect(snapshot).toMatchObject({
      meshes: 1,
      instances: 1,
      vertices: 24,
      triangles: 900,
      drawCalls: 5,
      geometries: 3,
      textures: 2,
      gpuMemory: {
        totalBytes: 96 * 1024 ** 2,
        textureBytes: 72 * 1024 ** 2,
        renderTargets: 4,
      },
      outputWidth: 1920,
      outputHeight: 1080,
      pixelRatio: 2,
      backend: "webgpu",
    });
  });
});
