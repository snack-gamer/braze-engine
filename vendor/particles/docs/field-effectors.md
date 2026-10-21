# Field Effectors

Physics in the effect composer should be authored as spatial field effectors, not as a fixed physics module inside every emitter.

## Mental Model

- Emitters define what particles are and when they spawn.
- Renderer defines how particles look.
- Field effectors define external influence in space.

This lets one moving object influence many particle systems. For example, a car can carry a wind effector that blows leaves, dust, smoke, and sparks without duplicating wind settings across every emitter.

## Effect Structure

```text
Effect
  Emitters
    Leaves
    Dust
    Smoke

  Effectors
    Car Wind
    Ground Collision
    Shockwave
```

Each effector has:

- Type: directional force, radial force, vortex, drag, collision later.
- Shape: infinite, sphere, box first; capsule, cone, mesh/SDF later.
- Falloff: none, linear, smooth, curve later.
- Timeline clip: when the field is active.
- Affected emitters: all emitters by default, or a selected subset.
- Transform: position/rotation/scale, so the effector can be attached to animated objects later.

## Initial Effector Types

```text
Directional Force
  Direction + strength. Good for wind.

Radial Force
  Pushes away from the effector origin. Good for blasts.

Vortex
  Swirls around an axis. Good for magic, smoke curls, suction.

Drag
  Dampens velocity inside a volume. Good for slow zones and sticky air.
```

## Authoring UI

Outliner:

```text
Effect
  Emitters
    Fire Core
    Smoke Plume

  Effectors
    Car Wind
    Shockwave
```

Timeline:

```text
Fire Core          |----------------------|
Smoke Plume           |-------------------|
Car Wind                   |------|
Shockwave                  |-|
```

Inspector for a selected effector:

```text
Effector
  Name
  Type
  Enabled

Shape
  Shape
  Falloff
  Radius / Size

Force
  Direction
  Strength

Affects
  All Emitters
  Fire Core
  Smoke Plume
```

Controls should be gated. Radius appears for sphere, size appears for box, direction appears for directional force and vortex, affected emitter checkboxes appear only when All Emitters is off.

## Runtime Design

Effectors are effect-level data. On each tick, the effect runtime filters active effectors per emitter and uploads a compact GPU buffer to that emitter backend.

The first GPU payload is fixed-size for predictable performance:

```ts
const MAX_EFFECTORS = 8;

interface GpuEffector {
  type: number;
  shape: number;
  falloff: number;
  strength: number;
  position: [number, number, number];
  radius: number;
  direction: [number, number, number];
  drag: number;
  size: [number, number, number];
}
```

Emitter targeting is resolved on CPU so the shader only loops over active effectors for that emitter.

## Phases

Phase 1:

- Core `ParticleEffector` model.
- Outliner and timeline rows for effectors.
- Effector inspector.
- GPU support for directional force, radial force, vortex, drag.
- Infinite, sphere, and box shapes.
- None, linear, and smooth falloff.

Phase 2:

- Visual helpers for effector shapes.
- Attach effectors to scene objects.
- Collision effectors: ground, sphere, box.
- Kill/stick/slip behaviors.

Phase 3:

- Scene depth collision.
- SDF or mesh volumes.
- Curve-based falloff.
- Spatial culling and larger effector counts.
