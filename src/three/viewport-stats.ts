import * as THREE from "three";
import type { ViewportRenderer, ViewportRendererBackend } from "./renderer";

const SAMPLE_INTERVAL_MS = 250;

export type VisibleGeometryStats = {
  meshes: number;
  instances: number;
  vertices: number;
};

export type HeapMemoryStats = {
  usedBytes: number;
  limitBytes: number | null;
};

export type ViewportSubmissionStats = Readonly<{
  triangles: number;
  drawCalls: number;
}>;

export type GpuMemoryStats = Readonly<{
  totalBytes: number;
  textureBytes: number;
  renderTargets: number;
}>;

export type ViewportStatsSnapshot = VisibleGeometryStats & {
  heap: HeapMemoryStats | null;
  triangles: number;
  drawCalls: number;
  geometries: number;
  textures: number;
  gpuMemory: GpuMemoryStats;
  outputWidth: number;
  outputHeight: number;
  pixelRatio: number;
  backend: ViewportRendererBackend;
};

export type ViewportStatsSampler = {
  sample: (
    now?: number,
    submission?: ViewportSubmissionStats,
  ) => ViewportStatsSnapshot | null;
};

export type ViewportStatsOutput = Readonly<{
  canvas: Pick<HTMLCanvasElement, "height" | "width">;
  pixelRatio: () => number;
}>;

type PerformanceWithMemory = Performance & {
  memory?: {
    usedJSHeapSize?: number;
    jsHeapSizeLimit?: number;
  };
};

export function collectVisibleGeometryStats(root: THREE.Object3D): VisibleGeometryStats {
  let meshes = 0;
  let instances = 0;
  let vertices = 0;

  root.traverseVisible((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;

    const instancedMesh = mesh as THREE.InstancedMesh;
    const instanceCount = instancedMesh.isInstancedMesh ? Math.max(0, instancedMesh.count) : 1;
    const position = mesh.geometry.getAttribute("position");
    meshes += 1;
    instances += instanceCount;
    vertices += (position?.count ?? 0) * instanceCount;
  });

  return { meshes, instances, vertices };
}

export function readHeapMemory(source: PerformanceWithMemory = performance as PerformanceWithMemory): HeapMemoryStats | null {
  const usedBytes = source.memory?.usedJSHeapSize;
  if (!Number.isFinite(usedBytes) || (usedBytes ?? 0) < 0) return null;

  const rawLimit = source.memory?.jsHeapSizeLimit;
  const limitBytes = Number.isFinite(rawLimit) && (rawLimit ?? 0) > 0 ? rawLimit! : null;
  return { usedBytes: usedBytes!, limitBytes };
}

export function createViewportStatsSampler(
  renderer: ViewportRenderer,
  objectRoot: THREE.Object3D,
  backend: ViewportRendererBackend,
  output: ViewportStatsOutput = {
    canvas: renderer.domElement,
    pixelRatio: () => renderer.getPixelRatio(),
  },
): ViewportStatsSampler {
  let lastSample: number | null = null;
  let latestSubmission: ViewportSubmissionStats | null = null;

  return {
    sample: (now = performance.now(), submission) => {
      if (submission) latestSubmission = normalizeSubmissionStats(submission);
      if (lastSample === null) {
        lastSample = now;
        return collectSnapshot(renderer, objectRoot, backend, output, latestSubmission);
      }

      const elapsed = now - lastSample;
      if (elapsed < SAMPLE_INTERVAL_MS) return null;
      if (elapsed <= 0) return null;

      lastSample = now;
      return collectSnapshot(
        renderer,
        objectRoot,
        backend,
        output,
        latestSubmission,
      );
    },
  };
}

function collectSnapshot(
  renderer: ViewportRenderer,
  objectRoot: THREE.Object3D,
  backend: ViewportRendererBackend,
  output: ViewportStatsOutput,
  submission: ViewportSubmissionStats | null,
): ViewportStatsSnapshot {
  const visibleGeometry = collectVisibleGeometryStats(objectRoot);
  const info = renderer.info;
  return {
    ...visibleGeometry,
    heap: readHeapMemory(),
    triangles: submission?.triangles ?? info.render.triangles,
    drawCalls: submission?.drawCalls ?? info.render.drawCalls,
    geometries: info.memory.geometries,
    textures: info.memory.textures,
    gpuMemory: {
      totalBytes: finiteNonNegative(info.memory.total),
      textureBytes: finiteNonNegative(info.memory.texturesSize),
      renderTargets: finiteNonNegative(info.memory.renderTargets),
    },
    outputWidth: output.canvas.width,
    outputHeight: output.canvas.height,
    pixelRatio: output.pixelRatio(),
    backend,
  };
}

function normalizeSubmissionStats(stats: ViewportSubmissionStats): ViewportSubmissionStats {
  return Object.freeze({
    triangles: finiteNonNegative(stats.triangles),
    drawCalls: finiteNonNegative(stats.drawCalls),
  });
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function formatCompactCount(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const absolute = Math.abs(value);
  if (absolute >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (absolute >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (absolute >= 1e4) return `${(value / 1e3).toFixed(0)}k`;
  if (absolute >= 1e3) return `${(value / 1e3).toFixed(1)}k`;
  return `${Math.round(value)}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${Math.round(bytes)} B`;
}
