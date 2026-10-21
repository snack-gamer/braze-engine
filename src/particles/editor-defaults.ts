import {
  MinMaxCurve,
  MinMaxGradient,
  ParticleCollider,
  ParticleEffector,
  ParticleEmitter,
  ParticleSystem,
  type ParticleColliderType,
  type ParticleEffectorType,
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
import { createAuthoredId } from "../identity/authored-id";

export function createDefaultEmitter(index: number): ParticleEmitter {
  const system = new ParticleSystem({ capacity: 80_000, duration: 5, looping: true, simulationSpace: "world" });
  system.add(new MainModule({
    startLifetime: MinMaxCurve.between(0.8, 1.6),
    startSpeed: MinMaxCurve.between(0.8, 1.8),
    startSize: MinMaxCurve.between(0.12, 0.24),
    startRotation: MinMaxCurve.between(0, Math.PI * 2),
    gravityModifier: MinMaxCurve.constant(0),
  }));
  system.add(new EmissionModule({ rate: 300 }));
  system.add(new ShapeModule({ kind: "sphere", radius: 0.2, emitFromShell: true }));
  system.add(new RendererModule({ texture: "circle", blendMode: "additive", tint: [0.7, 0.9, 1, 0.8] }));
  system.add(new ColorOverLifetimeModule({
    color: MinMaxGradient.gradient({
      colorStops: [
        { time: 0, color: [0.8, 0.95, 1, 1] },
        { time: 1, color: [0.2, 0.4, 1, 1] },
      ],
      alphaStops: [
        { time: 0, alpha: 0 },
        { time: 0.12, alpha: 0.8 },
        { time: 1, alpha: 0 },
      ],
    }),
  }));
  system.add(new SizeOverLifetimeModule({
    size: MinMaxCurve.curve([
      { time: 0, value: 0.3 },
      { time: 0.4, value: 1 },
      { time: 1, value: 0.1 },
    ]),
  }));
  system.add(new VelocityOverLifetimeModule());
  system.add(new CollisionModule());
  return new ParticleEmitter({ id: createAuthoredId("emitter"), name: `Emitter ${index}`, system });
}

export function createDefaultCollider(index: number, type: ParticleColliderType): ParticleCollider {
  return new ParticleCollider({
    id: createAuthoredId("collider"),
    name: `${type === "plane" ? "Ground" : type === "sphere" ? "Sphere" : "Box"} Collider ${index}`,
    type,
    radius: type === "sphere" ? 1.5 : 1,
    size: type === "box" ? [3, 1, 3] : [2, 2, 2],
    bounce: type === "plane" ? 0 : 0.1,
    friction: type === "plane" ? 0.72 : 0.55,
    stickiness: type === "plane" ? 0.65 : 0.2,
    settleSpeed: 0.08,
    transform: {
      position: type === "sphere" ? [0, 1.5, 0] : type === "box" ? [0, 0.5, 0] : [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
  });
}

export function createDefaultEffector(index: number, type: ParticleEffectorType): ParticleEffector {
  return new ParticleEffector({
    id: createAuthoredId("effector"),
    name: `${effectorName(type)} ${index}`,
    type,
    shape: type === "directionalForce" ? "infinite" : "sphere",
    falloff: type === "directionalForce" ? "none" : "smooth",
    strength: type === "radialForce" ? 18 : type === "vortex" ? 10 : type === "drag" ? 2 : type === "turbulence" ? 5 : 8,
    direction: type === "directionalForce" ? [1, 0, 0] : [0, 1, 0],
    radius: 3,
    size: [3, 3, 3],
    vortexMode: type === "vortex" ? "orbit" : "free",
    vortexPull: type === "vortex" ? 6 : 0,
    vortexOrbitRadius: type === "vortex" ? 1.25 : 1,
    randomStrength: 0.1,
    randomPosition: 0,
    randomDirection: 0.08,
    turbulenceDetail: 1,
    turbulenceScale: 10,
    turbulenceScaleRandom: 0.3,
  });
}

function effectorName(type: ParticleEffectorType): string {
  if (type === "directionalForce") return "Wind";
  if (type === "radialForce") return "Radial Blast";
  if (type === "vortex") return "Vortex";
  if (type === "drag") return "Drag";
  return "Turbulence";
}
