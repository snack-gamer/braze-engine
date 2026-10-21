import {
  MinMaxCurve,
  MinMaxGradient,
  ParticleEffect,
  ParticleCollider,
  ParticleSystem,
  type ParticleEffectConfig,
} from "@particles/core";
import {
  CollisionModule,
  ColorOverLifetimeModule,
  EmissionModule,
  MainModule,
  RendererModule,
  ShapeModule,
  SizeOverLifetimeModule,
  VelocityOverLifetimeModule,
} from "@particles/modules";
import type { ParticleEffectSettings } from "./domain/particle-effect";
import { applySerializedParticleEffect } from "./effect-state";
export {
  defaultParticleEffectSettings,
  normalizeParticleEffectSettings,
  particleSettingsSignature,
} from "./settings";

export function createParticleEffect(settings: ParticleEffectSettings): ParticleEffect {
  const config: Partial<ParticleEffectConfig> = {
    seed: settings.seed,
    duration: settings.duration,
    looping: settings.looping,
    timeScale: settings.timeScale,
  };
  const effect = new ParticleEffect(config);
  effect.addEmitter({ id: "fire_core", name: "Fire Core", system: createFireSystem(settings.capacityScale) });
  effect.addEmitter({
    id: "smoke_plume",
    name: "Smoke Plume",
    startDelay: 0.2,
    system: createSmokeSystem(settings.capacityScale),
  });
  effect.addCollider(new ParticleCollider({
    id: "ground_collider",
    name: "Ground Collider",
    type: "plane",
    bounce: 0,
    friction: 0.72,
    stickiness: 0.65,
    settleSpeed: 0.08,
  }));
  applySerializedParticleEffect(effect, settings.effectState);
  return effect;
}

function scaledCapacity(base: number, scale: number): number {
  return Math.max(1024, Math.round(base * scale));
}

function createFireSystem(capacityScale: number): ParticleSystem {
  const system = new ParticleSystem({
    capacity: scaledCapacity(80_000, capacityScale),
    duration: 5,
    looping: true,
    simulationSpace: "world",
  });
  system.add(new MainModule({
    startLifetime: MinMaxCurve.between(1.0, 1.8),
    startSpeed: MinMaxCurve.between(1.5, 3.0),
    startSize: MinMaxCurve.between(0.18, 0.30),
    startRotation: MinMaxCurve.between(0, Math.PI * 2),
    gravityModifier: MinMaxCurve.constant(-0.25),
  }));
  system.add(new EmissionModule({ rate: 1200 }));
  system.add(new ShapeModule({ kind: "cone", radius: 0.25, angle: Math.PI / 8 }));
  system.add(new RendererModule({ texture: "flame", blendMode: "additive", tint: [1, 1, 1, 1] }));
  system.add(new VelocityOverLifetimeModule({
    x: MinMaxCurve.between(-0.4, 0.4),
    y: MinMaxCurve.constant(0),
    z: MinMaxCurve.between(-0.4, 0.4),
  }));
  system.add(new ColorOverLifetimeModule({
    color: MinMaxGradient.gradient({
      colorStops: [
        { time: 0, color: [1.0, 1.0, 0.9, 1] },
        { time: 0.2, color: [1.0, 0.8, 0.3, 1] },
        { time: 0.5, color: [1.0, 0.4, 0.1, 1] },
        { time: 0.8, color: [0.4, 0.1, 0.05, 1] },
        { time: 1, color: [0.1, 0.1, 0.1, 1] },
      ],
      alphaStops: [
        { time: 0, alpha: 0 },
        { time: 0.1, alpha: 0.9 },
        { time: 0.6, alpha: 0.6 },
        { time: 1, alpha: 0 },
      ],
    }),
  }));
  system.add(new SizeOverLifetimeModule({
    size: MinMaxCurve.curve([
      { time: 0, value: 0.4 },
      { time: 0.3, value: 1.0 },
      { time: 1, value: 0.2 },
    ]),
  }));
  system.add(new CollisionModule());
  return system;
}

function createSmokeSystem(capacityScale: number): ParticleSystem {
  const system = new ParticleSystem({
    capacity: scaledCapacity(40_000, capacityScale),
    duration: 5,
    looping: true,
    simulationSpace: "world",
  });
  system.add(new MainModule({
    startLifetime: MinMaxCurve.between(1.8, 3.2),
    startSpeed: MinMaxCurve.between(0.6, 1.1),
    startSize: MinMaxCurve.between(0.35, 0.7),
    startRotation: MinMaxCurve.between(0, Math.PI * 2),
    gravityModifier: MinMaxCurve.constant(-0.05),
  }));
  system.add(new EmissionModule({ rate: 220 }));
  system.add(new ShapeModule({ kind: "cone", radius: 0.3, angle: Math.PI / 10 }));
  system.add(new RendererModule({ texture: "smoke", blendMode: "alpha", tint: [0.75, 0.75, 0.72, 0.55] }));
  system.add(new VelocityOverLifetimeModule({
    x: MinMaxCurve.between(-0.15, 0.15),
    y: MinMaxCurve.constant(0.15),
    z: MinMaxCurve.between(-0.15, 0.15),
  }));
  system.add(new ColorOverLifetimeModule({
    color: MinMaxGradient.gradient({
      colorStops: [
        { time: 0, color: [0.32, 0.30, 0.28, 1] },
        { time: 0.5, color: [0.42, 0.40, 0.38, 1] },
        { time: 1, color: [0.18, 0.18, 0.18, 1] },
      ],
      alphaStops: [
        { time: 0, alpha: 0 },
        { time: 0.2, alpha: 0.35 },
        { time: 1, alpha: 0 },
      ],
    }),
  }));
  system.add(new SizeOverLifetimeModule({
    size: MinMaxCurve.curve([
      { time: 0, value: 0.4 },
      { time: 0.5, value: 1.4 },
      { time: 1, value: 2.2 },
    ]),
  }));
  system.add(new CollisionModule());
  return system;
}
