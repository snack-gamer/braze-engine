import { ParticleEffectView, type PassTargetState } from "@particles/gpu";
import * as THREE from "three";
import type { ParticleEffectSettings, SceneObject } from "../../types";
import {
  createParticleEffect,
  normalizeParticleEffectSettings,
  particleSettingsSignature,
} from "../../particles/presets";
import {
  createSharedParticleGpuResolver,
  type ParticleGpuState,
} from "./shared-gpu-source";
import { ParticleActivityObserver } from "./particle-activity-observer";

type ParticleEntry = {
  objectId: string;
  signature: string;
  view: ParticleEffectView;
};

export type ParticleViewport = {
  isActive: (objects: SceneObject[], visible: boolean) => boolean;
  syncGpuForAdmittedRender: (
    objects: SceneObject[],
    objectMap: Map<string, THREE.Group>,
    visible: boolean,
  ) => void;
  tickGpuForAdmittedRender: (dt: number) => void;
  renderToPass: (pass: GPURenderPassEncoder, camera: THREE.Camera, targetState?: PassTargetState) => void;
  dispose: () => void;
};

type ParticleViewportOptions = {
  colorFormat?: () => GPUTextureFormat;
  device?: () => GPUDevice | null;
  depthFormat?: () => GPUTextureFormat | undefined;
  onGpuUnavailable?: (message: string) => void;
  onGpuCommitReady?: () => void;
  sampleCount?: () => number;
};

const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3();

// Normalizing + stringifying the full effect state every frame is wasteful;
// scene state is immutable, so cache per settings-object reference.
type ResolvedSettings = { settings: ParticleEffectSettings; signature: string };
const settingsCache = new WeakMap<object, ResolvedSettings>();
let defaultSettingsCache: ResolvedSettings | null = null;

function resolveSettings(particle: SceneObject["particle"]): ResolvedSettings {
  if (!particle) {
    if (!defaultSettingsCache) {
      const settings = normalizeParticleEffectSettings(undefined);
      defaultSettingsCache = { settings, signature: particleSettingsSignature(settings) };
    }
    return defaultSettingsCache;
  }
  let resolved = settingsCache.get(particle);
  if (!resolved) {
    const settings = normalizeParticleEffectSettings(particle);
    resolved = { settings, signature: particleSettingsSignature(settings) };
    settingsCache.set(particle, resolved);
  }
  return resolved;
}

export function createParticleViewport(_host: HTMLElement, options: ParticleViewportOptions = {}): ParticleViewport {
  let gpu: ParticleGpuState | null = null;
  let disposed = false;
  let shouldRender = false;
  let lastSyncedObjects: SceneObject[] | null = null;
  let lastSyncedGpu: ParticleGpuState | null = null;
  const entries = new Map<string, ParticleEntry>();
  const liveObjectIdsScratch = new Set<string>();
  const activity = new ParticleActivityObserver();
  const resolveGpu = createSharedParticleGpuResolver(
    options,
    options.onGpuUnavailable ?? defaultGpuUnavailableReporter,
  );

  const ensureGpu = () => {
    if (gpu || disposed) return;
    gpu = resolveGpu();
  };

  const remove = (id: string) => {
    const entry = entries.get(id);
    if (!entry) return;
    entry.view.dispose();
    entry.view.removeFromParent();
    entries.delete(id);
  };

  const syncEntryTransform = (entry: ParticleEntry, objectMap: Map<string, THREE.Group>) => {
    const node = objectMap.get(entry.objectId);
    if (!node) return;
    node.updateWorldMatrix(true, false);
    node.matrixWorld.decompose(_position, _quaternion, _scale);
    entry.view.position.copy(_position);
    entry.view.quaternion.copy(_quaternion);
    entry.view.scale.copy(_scale);
    // Refresh the world matrix here (not just in tick) so transforms still
    // apply to rendered particles while playback is paused.
    entry.view.updateWorldMatrix(false, false);
  };

  const syncEntryForAdmittedRender = (
    entry: ParticleEntry,
    objectMap: Map<string, THREE.Group>,
  ) => {
    entry.view.commitPendingGpuResources();
    syncEntryTransform(entry, objectMap);
  };

  return {
    isActive: (objects, visible) => activity.isActive(objects, visible),
    syncGpuForAdmittedRender(objects, objectMap, visible) {
      shouldRender = activity.isActive(objects, visible);
      if (shouldRender && !gpu) ensureGpu();
      const structureChanged = objects !== lastSyncedObjects || gpu !== lastSyncedGpu;
      if (!structureChanged) {
        for (const entry of entries.values()) syncEntryForAdmittedRender(entry, objectMap);
        return;
      }

      const live = liveObjectIdsScratch;
      live.clear();
      for (const object of objects) {
        if (object.primitive !== "particle" || object.visible === false) continue;
        const { settings, signature } = resolveSettings(object.particle);
        if (!settings.enabled) continue;
        live.add(object.id);
        const node = objectMap.get(object.id);
        if (!node || !gpu) continue;
        const colorFormat = options.colorFormat?.() ?? gpu.colorFormat;
        const depthFormat = options.depthFormat?.();
        const sampleCount = options.sampleCount?.() ?? 1;
        const pipelineSignature = `${signature}:${colorFormat}:${depthFormat ?? "nodepth"}:${sampleCount}`;
        let entry = entries.get(object.id);
        if (!entry || entry.signature !== pipelineSignature) {
          remove(object.id);
          const view = new ParticleEffectView(createParticleEffect(settings), {
            device: gpu.device,
            colorFormat,
            depthFormat,
            sampleCount,
            onGpuCommitReady: options.onGpuCommitReady,
          });
          view.name = object.name || "Particle Effect";
          if (settings.autoPlay) view.play();
          entry = { objectId: object.id, signature: pipelineSignature, view };
          entries.set(object.id, entry);
        }
        syncEntryForAdmittedRender(entry, objectMap);
      }
      for (const id of entries.keys()) {
        if (!live.has(id)) remove(id);
      }
      lastSyncedObjects = objects;
      lastSyncedGpu = gpu;
    },
    tickGpuForAdmittedRender(dt) {
      if (!gpu || !shouldRender || entries.size === 0) return;
      for (const entry of entries.values()) entry.view.tick(dt);
    },
    renderToPass(pass, camera, targetState) {
      if (!gpu || !shouldRender || entries.size === 0) return;
      for (const entry of entries.values()) entry.view.render(pass, camera, targetState);
    },
    dispose() {
      disposed = true;
      for (const entry of entries.values()) {
        entry.view.dispose();
        entry.view.removeFromParent();
      }
      entries.clear();
    },
  };
}

function defaultGpuUnavailableReporter(message: string): void {
  console.error(`[particles] ${message}`);
}
