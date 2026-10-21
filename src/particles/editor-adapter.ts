import * as THREE from "three";
import type { ParticleEffect, ParticleSystem } from "@particles/core";
import type { PlayState } from "@particles/gpu";

export class InspectorSystemView extends THREE.Object3D {
  readonly system: ParticleSystem;
  playState: PlayState = "playing";
  hasFinished = false;

  // On every edit the inspector cheaply live-patches its GPU backend
  // (patchLUT / patchUniform / applyRendererConfig / setSpriteFrameLut) to
  // preview the change. Here the inspector is decoupled from the GPU: the
  // viewport owns the real ParticleEffectView and rebuilds it from persisted
  // scene state after each edit is saved. These stay no-ops — without them the
  // patch call throws ("Cannot read properties of undefined (reading
  // 'patchLUT')") before the edit can persist, which made speed and every other
  // curve/uniform control appear unchangeable.
  readonly backend = {
    patchLUT: () => {},
    patchUniform: () => {},
    applyRendererConfig: () => {},
    setSpriteFrameLut: () => {},
  };

  constructor(system: ParticleSystem) {
    super();
    this.system = system;
  }

  rebuild(): void {}
  restart(): void {}
}

export class InspectorEffectView extends THREE.Object3D {
  readonly effect: ParticleEffect;
  playState: PlayState = "stopped";
  private readonly emitters = new Map<string, InspectorSystemView>();

  constructor(effect: ParticleEffect) {
    super();
    this.effect = effect;
    this.refreshEmitters();
  }

  play(): void {
    this.playState = "playing";
  }

  restart(): void {
    this.playState = "playing";
  }

  refreshEmitters(): void {
    const live = new Set(this.effect.emitters.map((emitter) => emitter.id));
    for (const [id, view] of this.emitters) {
      if (!live.has(id)) {
        view.removeFromParent();
        this.emitters.delete(id);
      }
    }
    for (const emitter of this.effect.emitters) {
      if (!this.emitters.has(emitter.id)) {
        const view = new InspectorSystemView(emitter.system);
        this.emitters.set(emitter.id, view);
        this.add(view);
      }
    }
  }

  refreshEffectors(): void {}
  refreshColliders(): void {}

  getEmitterView(id: string): InspectorSystemView | undefined {
    return this.emitters.get(id);
  }

  dispose(): void {
    this.clear();
    this.emitters.clear();
  }
}
