# Effect Composer

The particle engine should grow from a single particle system into an effect
composer. A production effect is usually a stack of cooperating emitters: flash,
smoke, sparks, debris, glow, trails, secondary bursts, and similar layers.

## Direction

Use an **Effect asset made of many Emitters** as the primary workflow.

```text
ParticleEffect
  config
  emitters: ParticleEmitter[]

ParticleEmitter
  id
  name
  enabled
  transform
  startDelay
  clipDuration
  endPolicy
  timeScale
  system: ParticleSystem
```

Each emitter owns one existing `ParticleSystem`. This keeps the current engine
valid and makes multi-system effects a composition layer instead of a rewrite.

## Authoring Workflow

The main authoring surface should be an outliner plus timeline, not a node graph
first.

- Effect outliner: add, duplicate, mute, solo, lock, group, and reorder emitters.
- Timeline lanes: start delay, duration, loop range, burst markers, and scrubbing.
- Clip end policy: stop emitting, loop after end, let particles finish, or kill after a delay.
- Inspector: selecting an emitter shows the existing particle-system inspector.
- Master playback: play, pause, stop, restart, seek, global time scale.
- Persistence: effect-level JSON with versioned emitters and system configs.

## Node Graph Role

Nodes should be an advanced control/event layer rather than the default way to
build an effect.

Good graph use cases:

- Route events from one emitter to another.
- Share parameters such as intensity, palette, wind, or impact normal.
- Drive emitters from gameplay inputs.
- Add conditions such as surface type or environment state.

## Runtime Shape

```text
ParticleEffectView extends THREE.Object3D
  emitterViews: ParticleSystemView[]
```

At first, each emitter keeps its own GPU backend. Later, compatible emitters can
share GPU resources or be batched if profiling shows that is necessary.

## Implementation Order

1. Done: add `ParticleEffect` and `ParticleEmitter` models in `core`.
2. Done: add `ParticleEffectView` in `gpu`, composed of multiple `ParticleSystemView`s.
3. Done: add editor outliner support for multiple emitters.
4. Done: reuse the existing inspector for the selected emitter.
5. Done: add effect-level persistence.
6. Done: add timeline lanes, timing edits, effect playback controls, and scrubbing.
7. Done: select and persist per-emitter transforms with viewport transform controls.
8. Done: add emitter clip duration and clip-end policy controls.
9. Next: add event routing.
10. Later: add optional node graph for advanced control wiring.
