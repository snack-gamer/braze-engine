# Coding Rulebook

Status: normative for new code and for code materially changed during a feature.

The [AI development contract](./AI_GAME_DEVELOPER.md) is also mandatory: new
capabilities require agent-game acceptance and a corresponding manual workflow.

This rulebook exists to keep the editor and engine understandable as they grow. It is deliberately stricter around runtime ownership, persistence, and per-frame code because mistakes there spread quickly and are difficult to diagnose.

The rules are not a demand to rewrite the repository. Existing code is improved incrementally. When a large or mixed-responsibility file is touched, the change should leave its boundaries clearer and should not make the concentration of responsibility worse.

## 1. Core standard

Every module should answer one primary question.

Examples:

- A codec answers how authored physics data is validated and serialized.
- A fixed-step clock answers how elapsed display time becomes simulation steps.
- A physics playback session owns one run of the runtime.
- An Inspector section renders and edits a defined part of authored state.
- A WebGPU pass records one stage of GPU work.

A module must not become the default home for work merely because it already has access to the required objects.

Prefer:

- explicit ownership over ambient state;
- small, typed APIs over shared mutable objects;
- composition over feature switches in a central class;
- named domain concepts over bags of optional properties;
- deterministic behavior over timing-dependent convenience;
- evidence from tests over status claims in planning documents.

## 2. Dependency direction

Feature code follows this direction:

```text
UI -> authoring/application -> domain <- serialization
                         |
                         v
                   runtime ports
                         ^
                         |
              Three/WebGPU adapters
```

The arrows mean “may depend on.” Dependencies must not point back upward.

### Domain

Domain modules contain engine concepts and rules. They do not import React, Three.js, WebGPU, browser storage, or editor components.
The architecture gate checks static/dynamic imports and direct browser access
in domain modules. Serialization modules are likewise prevented from importing
UI, hooks, runtime adapters, React, or Three.js.

They may contain:

- authored component types;
- validated value objects;
- collision-filter rules;
- physics material combination rules;
- runtime-neutral commands and events.

### Serialization

Serialization modules own persisted shapes, validation, defaults, migrations, and conversion to domain objects. UI components and runtime adapters do not parse raw project JSON themselves.

### Authoring/application

Application modules coordinate use cases such as adding a collider, changing a Rigidbody property, entering Play Mode, or compiling an authored scene. They depend on domain contracts and expose narrow operations to the UI.

### Runtime ports

Ports describe what the application needs from a physics runtime without exposing WebGPU buffers or Three.js nodes. Backend-specific objects stay behind adapters.

### Adapters

Adapters translate between domain/runtime contracts and external systems such as Three.js and WebGPU. Coordinate-system conversion, world/local transform conversion, GPU resource creation, and readback belong here.

### UI

UI modules display state and invoke application operations. They must not compile solver scenes, mutate GPU resources, perform persistence migrations, or implement physics rules.

## 3. Responsibility and file size

Line count is a warning signal, not an architectural goal. A short file can still be badly designed, and splitting one coherent algorithm into arbitrary fragments can make it worse.

Use these guardrails for handwritten source modules:

| Module kind | Healthy target | Review required | Split or document an exception |
| --- | ---: | ---: | ---: |
| React component or hook | up to 250 lines | over 250 | over 400 |
| Domain service, controller, or adapter | up to 350 lines | over 350 | over 600 |
| Codec or schema module | up to 300 lines | over 300 | over 500 |
| Feature stylesheet | up to 800 lines | over 800 | over 1,200 |

Exceptions can be appropriate for a cohesive shader stage, generated code, static data, or a migration that is safer to review as one unit. The reason must be stated near the module or in the change description.

Rules:

- Do not add a new handwritten module above the exception threshold without an explicit reason.
- Existing oversized files may only shrink; do not increase a budget to land work.
- A materially changed oversized file must shrink through a responsibility extraction; a follow-up note is not an exception to the ratchet.
- Extract by responsibility and ownership, not by slicing consecutive line ranges.
- Avoid generic `manager`, `helpers`, `common`, and `utils` modules. Use a domain-specific name and API.
- A barrel file exports a public surface; it does not contain behavior.

Common extraction seams include:

- state and reducer;
- persistence codec;
- runtime session;
- command construction;
- resource lifecycle;
- feature-specific Inspector section;
- platform adapter;
- pure calculations.

## 4. Application shell rule

The application root may compose providers, panels, routing, and top-level commands. It must not own feature algorithms or grow a branch for every new engine component.

Feature work should enter the shell through a small integration surface:

- a provider or feature controller;
- a registered Inspector section;
- a menu/command descriptor;
- an editor service port;
- a panel component.

If adding a physics feature requires editing several unrelated regions of the application root, first introduce a feature boundary.

## 5. State ownership

Every piece of state belongs to exactly one of these categories:

| Category | Examples | Owner |
| --- | --- | --- |
| Authored, persisted state | colliders, Rigidbody settings, gravity, materials | project/editor model |
| Runtime state | velocities, solver multipliers, sleeping state, contacts | playback session/runtime |
| Derived state | compiled solver scene, world matrices, debug geometry | producing service or cache |
| UI preference state | open sections, viewport overlay toggles | UI/editor preferences |

Rules:

- Runtime simulation must not overwrite authored state.
- Derived state is rebuilt or invalidated; it is not persisted as a second source of truth.
- UI preference state does not alter engine semantics.
- A value is not duplicated merely to avoid defining an owner.
- Mutations enter through a named operation so undo/redo and dirty-state tracking remain possible.
- Play Mode snapshots include all authored state that a runtime session can observe.
- Exiting Play Mode restores the authored snapshot and discards runtime-only state.

## 6. Data modeling

Model components as explicit domain concepts rather than optional fields spread across scene objects.

Prefer discriminated unions for variants:

```ts
type ColliderShape =
  | { kind: "box"; size: Vec3 }
  | { kind: "sphere"; radius: number }
  | { kind: "capsule"; radius: number; height: number; axis: Axis };
```

Rules:

- Units and coordinate conventions are documented at the type boundary.
- Defaults have one authoritative definition.
- Invalid combinations are rejected or made unrepresentable.
- Runtime-only identifiers are not persisted as project identity.
- Public authored types do not expose GPU packing or shader layout details.
- Avoid booleans whose meaning changes other properties. Prefer an explicit mode union.
- Use branded or validated values where mixing identifiers or units would be costly.

### Runtime representations

Authored data does not double as the storage layout for a high-cardinality hot
path. Compile or reconcile descriptive authored objects into a representation
that matches runtime access:

- use typed arrays, structure-of-arrays storage, stable numeric handles, GPU
  buffers, or another bounded data-oriented layout for collections traversed by
  frame or simulation work;
- keep public authored types independent from GPU packing, alignment, dense
  indices, and other runtime-only details;
- define capacity, growth, invalidation, and authored-ID-to-runtime-handle
  mapping explicitly;
- reuse runtime storage instead of allocating an object graph every step; and
- do not impose an ECS or typed-array layout on small, cold collections without
  a measured or structural reason.

The conversion boundary owns validation and diagnostics. Runtime density must
not make persisted identity unstable or create a second authored source of
truth.

## 7. Serialization and compatibility

Persisted project data is a public contract.

Every persisted feature needs:

- a schema/version strategy;
- validation of unknown input;
- centralized defaults;
- an explicit migration path when shape or meaning changes;
- round-trip tests;
- backward-compatibility fixtures for supported older data.

Rules:

- React components never read or write raw persisted JSON.
- Do not silently reinterpret an existing field with new units or semantics.
- A missing field and an explicitly authored zero/false value must remain distinguishable where meaningful.
- Unknown or malformed values produce a controlled diagnostic and safe fallback.
- Serialization names prioritize stability; display labels may change independently.
- A migration is deterministic and idempotent.
- Project-authored libraries belong in the project document. Browser storage
  may be a validated offline/UI fallback, never the only copy of authored data.
- A failed project load must block automatic writes from browser recovery data.
  Edits made before hydration complete are rebased with a three-way merge;
  overlapping edits become a visible conflict.
- Independently saved project sections use a serialized merge/write boundary;
  concurrent debounced saves must not lose one another's fields.

## 8. Runtime lifecycle

A runtime session owns all resources and asynchronous work created for one Play Mode run.

It must define:

- construction and validation;
- start and fixed-step update;
- pause/resume if supported;
- reset or reconstruction semantics;
- disposal;
- handling of device loss and asynchronous completion.

Rules:

- Resource ownership is explicit. The creator either disposes the resource or transfers ownership through the API.
- Disposal is safe to call once and leaves no active callback capable of mutating the editor.
- Asynchronous callbacks carry a session/generation token and ignore stale results.
- A stale callback that already created an owned clone/buffer/texture disposes
  that result before returning; ignoring attachment alone is not sufficient.
- Entering a new Play session cannot receive results from a previous session.
- Errors cross the runtime boundary as structured diagnostics, not only console output.
- WebGPU capability failure is reported before gameplay starts.

## 9. Simulation time

Physics advances on a fixed simulation timestep, independent of render frequency.

The fixed-step driver must:

- accumulate elapsed real time;
- clamp extreme frame gaps;
- run zero or more fixed steps per display frame;
- cap catch-up work to avoid a spiral of death;
- make discarded backlog observable in diagnostics;
- expose interpolation state separately from authoritative simulation state.

Rules:

- Do not call one physics step unconditionally per animation frame.
- Do not pass a variable render delta into a solver designed for a fixed timestep.
- Time scale is applied at one documented boundary.
- Pausing does not accumulate an unbounded backlog.
- Tests exercise at least two render cadences against the same fixed-step result.

## 10. Transform boundaries

Authoring uses scene-graph transforms; a rigid-body solver normally consumes world-space body transforms. Conversion is an adapter responsibility.

Rules:

- Scene compilation updates world matrices before reading transforms.
- Parent transforms, non-uniform scale policy, collider local pose, and center of mass are handled explicitly.
- Runtime writeback converts solver world pose into the node's parent-local pose.
- Scale is never inferred from a physics pose.
- Unsupported transform combinations fail with a useful diagnostic instead of silently producing a different body.
- Coordinate handedness and quaternion ordering are tested at the adapter boundary.

## 11. Per-frame performance

The hot path is any operation performed each render frame or simulation step.

The governing constraint is GPU residency: **no per-body CPU work and no GPU-to-CPU readback in the frame loop.** Per-frame CPU cost must be O(scene changes), not O(bodies). See `docs/CODING_RULEBOOK.md`, which is normative and explains why. An earlier wording of this section said rendering should consume GPU-resident results "where practical" and allowed readback "justified by a measured requirement"; that hedge is how the physics path acquired a per-frame readback and a per-body scene-graph writeback, and it is withdrawn.

Rules:

- Avoid per-frame GPU buffer creation, shader compilation, large array allocation, and object-graph traversal.
- Cache only with explicit invalidation and ownership.
- Immutable authored-state references may key precomputed plans/signatures. Do
  not normalize, map, stringify, or re-index the whole world merely to discover
  that the same state object reached another frame.
- Per-frame systems must have a constant-time disabled path. A world with no
  particles, cloners, modifiers, labels, physics, or Stats does no work for that
  subsystem.
- Expensive shadows and diagnostics use explicit dirty generations/cadence;
  they are not refreshed simply because an unrelated render frame occurred.
- GPU-to-CPU readback in the frame loop is not permitted. Readback is for debugging, or is selective and on demand (the selected object, a picking result) — never every object every frame.
- Rendering consumes GPU-resident simulation results. Simulation output is bound as instance data; it is not copied through JavaScript.
- Capacity growth is explicit, bounded, and diagnosable.
- Profiling labels identify meaningful passes and stages.
- Optimize after correctness, but do not choose an architecture that requires a known synchronization stall every frame.

Before adding to the frame loop, answer: what does this cost at 100,000 bodies? A small test scene hides this failure mode completely.

Performance changes include before/after evidence using the same scene and configuration. Record the actual adapter: a headless browser may select a software WebGPU adapter, whose timings do not establish real-hardware performance. See [browser verification](./OPERATIONS.md#browser-matrix) for the managed browser launch contract.

### Workers and WebAssembly

TypeScript is the default implementation language. A Web Worker or WebAssembly
module is introduced only when profiling a representative workload identifies
a CPU cost, main-thread contention, or maintained native library that justifies
the added boundary.

Rules:

- Worker jobs have a narrow typed message contract, one owner, cancellation or
  supersession semantics, bounded queueing, and stale-result disposal.
- Transfer `ArrayBuffer` ownership when possible; do not copy large payloads or
  complete runtime state across threads every frame.
- A Worker does not invent a private render or simulation clock. Continuous
  work remains coordinated with the engine's time and session contracts.
- WebAssembly kernels live behind runtime ports. Their linear memory,
  initialization, failures, and disposal have explicit owners.
- React components do not directly own Workers or WebAssembly instances;
  application/runtime services expose typed operations and snapshots.
- Workers and WebAssembly do not justify GPU-to-CPU readback, duplicated
  authoritative state, or an unmeasured rewrite of clear TypeScript code.

## 12. WebGPU backend rules

Low-level physics solver code is a backend, not the editor's domain model.

Braze has one rendering and GPU-compute backend: WebGPU. If the browser cannot
provide a usable adapter/device that meets the documented baseline, runtime
initialization stops with a structured unsupported-platform diagnostic. Do not
add WebGL, CPU rendering, or another automatic compatibility backend.

Each GPU stage owns:

- its bind group/pipeline requirements;
- its input/output contract;
- capacity and alignment assumptions;
- command encoding for one defined stage;
- destruction of resources it creates.

Rules:

- Resolve one device-owned capability profile during initialization. Runtime
  features consume it instead of scattering adapter/feature checks throughout
  UI and domain code.
- Distinguish required baseline capabilities from optional WebGPU enhancements.
  A missing requirement fails before gameplay; an optional path may reduce
  quality only when the behavior and user-facing limitation are documented.
- Validate requested limits and planned capacities against the active adapter's
  reported features and limits before allocating dependent resources.
- Do not assume a GPU vendor, operating system, preferred canvas format, or
  optional WebGPU feature without proving it through the capability profile.
- Buffer layouts have one authoritative TypeScript description and matching shader documentation.
- Magic byte offsets and workgroup assumptions are named.
- Shader stages remain separately testable or inspectable.
- Pipeline orchestration orders stages; it does not absorb their algorithms.
- Validation errors include the stage and relevant capacity/layout context.
- Debug readback is separated from production stepping.
- Backend-only solver parameters stay out of the standard Inspector unless they are safe authoring concepts.

Generated WGSL and unusually long cohesive shader modules are permitted exceptions to general file limits. A shader file that implements unrelated solver stages is not.

## 13. React and editor UI

Editor UI follows established game-engine authoring concepts where they fit the product: component-based Inspectors, explicit Play/Edit modes, scene hierarchy, reusable assets, and debug visualization. Familiarity is a workflow constraint, not permission to expose non-functional controls.

Rules:

- A control appears only when its behavior is implemented, persisted, and tested.
- Inspector components receive typed state and named edit operations.
- Domain calculations and serialization stay outside JSX.
- Long Inspector sections are composed from feature-specific subsections.
- Controls use accessible labels and keyboard behavior.
- Numeric inputs state or imply their unit and enforce valid ranges.
- Disabled controls explain the condition when it is not obvious.
- Multi-selection behavior is decided explicitly: common value, mixed value, or unavailable.
- Edits participate in undo/redo and dirty-state tracking.
- Debug visualization is optional and cannot change simulation behavior.
- Dock layout is the sole owner of pane sizing. Pane content must not retain a
  hidden legacy resize handle, storage key, pointer listener, or competing CSS
  size variable.
- Inactive/closed panes may retain React state, but they do not claim global
  keyboard input, run hidden render/simulation loops, or mutate playback.
- Large collections use stable keys and derived indexes, and are windowed or
  virtualized once rendering all rows/nodes exceeds the interaction budget.
- Per-frame runtime data does not flow through root React state. A small leaf
  may consume a bounded, cadence-limited diagnostic or playhead snapshot.

### Surface hierarchy

Editor surfaces follow one neutral elevation ladder: canvas/well, window,
contained region, component card, component header, raised/hover. A child
container must be subtly brighter than the surface that owns it so Inspector
components, hierarchy rows, asset tiles, and popovers remain visually distinct.

Rules:

- Consume the shared `--layer-*` tokens from `editor-theme.css`; feature CSS
  must not invent another near-identical grey.
- Keep selectors with the feature surface that owns them. Compatibility entry
  stylesheets may contain ordered imports only; they are not a home for new
  rules. Treat import order and intentional cross-feature overrides as part of
  the public cascade contract.
- Use brightness, a quiet outline, and at most a shallow shadow to communicate
  containment. Do not assign alternating arbitrary greys to sibling cards.
- Inputs remain recessed wells inside components; headers and hover states move
  upward by one elevation level.
- Interaction accent, semantic status colors, and 3D axis colors do not define
  structural elevation.
- A new panel must be checked in normal, hover, selected, disabled, and focus
  states against both its parent surface and neighboring panels.

## 14. Naming and APIs

Names should reveal the domain and lifecycle.

Prefer:

- `PhysicsPlaybackSession` over `PhysicsManager`;
- `compileAuthoredPhysicsScene` over `setupPhysics`;
- `ColliderCodec` over `physicsUtils`;
- `dispose()` over a boolean that indirectly stops work.

Rules:

- Public functions use domain language and have narrow parameters.
- Avoid parameter lists that grow with every feature; introduce a cohesive input object.
- Avoid `any`; validate `unknown` at boundaries.
- Boolean parameters are replaced with named options when the call is ambiguous.
- Errors include what failed, the affected object/stage, and a useful next action.
- Logging is structured and rate-limited in hot paths.
- Comments explain constraints and intent, not a transcription of the code.

## 15. Testing and evidence

Tests are part of implementation, not a later phase.

Minimum layers for physics work:

### Pure unit tests

- defaults and validation;
- serialization and migrations;
- fixed-step scheduling;
- material/filter combination rules;
- coordinate and world/local transform conversion.

### Solver/backend tests

- deterministic small scenes with numeric tolerances;
- contact generation and persistence;
- supported constraint behavior;
- capacity and empty-scene boundaries;
- resource cleanup and stale async result guards.

### Integration tests

- author a component, save/load, enter Play Mode, simulate, and restore;
- parented rigid bodies;
- frame-cadence independence;
- unsupported-device and runtime-error presentation.

### Visual/manual checks

- collider gizmos align with runtime collision geometry;
- debug contacts and body state are understandable;
- Inspector workflow is usable at normal viewport sizes.

Rules:

- A bug fix includes a regression test at the lowest useful layer.
- Floating-point assertions use documented tolerances.
- Randomized tests use recorded seeds.
- Manual validation supplements automated checks; it does not replace them.
- Planning-document checkboxes are not evidence of runtime correctness.
- CI/build scripts expose one canonical command for the required checks.

## 16. Refactoring discipline

Refactoring should reduce risk for the next feature while preserving behavior.

Sequence larger changes as follows:

1. Characterize current behavior with tests or fixtures.
2. Introduce a boundary or port.
3. Move one responsibility without changing semantics.
4. Verify behavior.
5. Add the new capability behind the boundary.
6. Remove the superseded path.

Rules:

- Keep structural refactors reviewable and avoid unrelated cosmetic churn.
- Do not maintain two authoritative implementations after migration.
- Temporary compatibility adapters have an owner and removal condition.
- Preserve user changes and unrelated work in the repository.
- Prefer several coherent milestones over a flag day rewrite.

## 17. Change checklist

A feature is not complete until the applicable items are true:

- [ ] Responsibility and owning layer are clear.
- [ ] Dependency direction is respected.
- [ ] Authored, runtime, derived, and UI state are not conflated.
- [ ] Persisted data is validated, versioned as needed, and round-trip tested.
- [ ] Play Mode snapshot/restore covers the new authored state.
- [ ] Fixed-step and transform boundaries remain correct.
- [ ] GPU/browser resources have explicit disposal.
- [ ] Async work cannot write into a stale session.
- [ ] Hot-path allocations/readbacks were reviewed.
- [ ] High-cardinality runtime data has a bounded, data-oriented representation.
- [ ] WebGPU requirements and adapter limits fail clearly without an alternate backend.
- [ ] Worker/WebAssembly use, if any, is measured, typed, bounded, and lifecycle-safe.
- [ ] Large React collections are indexed and virtualized where required.
- [ ] Inspector controls correspond to real supported behavior.
- [ ] Automated tests cover the smallest useful behavior and key integration path.
- [ ] Build, type checking, and canonical verification commands pass.
- [ ] User-facing limitations and diagnostics are documented.
- [ ] Changed oversized files became smaller; no architecture budget increased.

## 18. Exceptions

An exception is acceptable when following a rule would make correctness or reviewability worse.

Document:

- the rule being excepted;
- why the exception is safer;
- its scope;
- whether it is permanent or the condition for removing it.

Exceptions do not silently become precedent. If the same exception recurs, update the architecture or the rulebook explicitly.

## Component authoring

### Keep the three authored concepts separate

Braze has three related concepts with different owners:

1. **A scene component** is attached to a scene or prefab entity. Its authored
   state is stored in that scene or prefab document.
2. **A reusable project asset** is created in the Project window and referenced
   by components. Examples include materials, Avatar Masks, audio clips,
   models, and textures.
3. **An asset sidecar** (`<source>.braze.meta`) owns the stable identity and
   importer state of one source asset. It is not a component store.

Do not collapse these concepts merely because their names are related. A
concept may still intentionally be scene-owned when reuse would add needless
indirection. Braze's `Animator Controller` is one such component: its state
machine is embedded in the scene or prefab component so adding it is a complete
authoring action. Avatar Masks remain reusable Project assets referenced by its
layers.

### Asset metadata contract

Every physical source asset under the project's Assets tree receives one
adjacent `.braze.meta` sidecar with this component-agnostic envelope:

```json
{
  "fileFormatVersion": 1,
  "guid": "stable-asset-guid",
  "importer": {
    "id": "braze.model",
    "settingsVersion": 1,
    "settings": {}
  },
  "labels": [],
  "foreignIds": {}
}
```

Components must respect that system as follows:

- Persist asset relationships as `AssetRef` values containing a stable `guid`
  and, when needed, a stable importer-owned `localId`.
- Never persist a filesystem path or runtime URL as the authoritative
  relationship. Resolve paths and runtime artifacts from the `AssetRef`.
- Never add `animator`, `collider`, `audioSource`, or other component-specific
  fields to the sidecar envelope.
- Import settings belong only under the selected importer's opaque,
  versioned `importer.settings` payload. The importer owns its defaults,
  validation, normalization, migration, and Inspector.
- Scene and prefab component values remain in scene and prefab documents.
  Derived hashes, previews, diagnostics, dependencies, and runtime artifacts
  remain in the generated Library index.
- Import-setting controls edit a draft. Only an explicit command such as
  **Apply & Reimport** or **Save & Reimport** writes the sidecar. There is no
  inferred “final interaction.”
- Sidecar writes use the Asset Database's revision-checked, queued, backed-up,
  atomic write boundary. Components and Inspectors must not write sidecars
  directly.
- Browser recovery for dirty import drafts must be versioned and keyed by the
  asset GUID plus its canonical base revision. Recovery remains visibly
  unsaved, never becomes a runtime source, clears only after successful Apply
  or explicit Revert, and must block on a conflicting canonical base.

If a component introduces a new imported asset family, add an importer and a
versioned settings codec. Do not create a component-specific metadata file
format. If it introduces a reusable authored asset, give that asset a proper
project document/asset identity and reference it from the component; do not
embed the reusable document in every component instance.

### Rename, deletion, duplication, and reimport

A component that references an asset must preserve identity through the whole
Asset Database lifecycle:

- **Move or rename:** keep the GUID and resolve the new path automatically.
- **Duplicate:** create a new GUID; never create two authoritative assets with
  the same identity.
- **Reimport or source edit:** keep the GUID and stable subasset local IDs.
- **Delete:** retain the component and its `AssetRef`, display a Missing Asset
  diagnostic/placeholder, and allow restoration of the same GUID to heal it.
- **Ambiguous external rename or duplicate GUID:** surface a diagnostic and do
  not guess.

Component removal is a scene/prefab edit. It must never delete the reusable
asset it referenced. Asset deletion is a Project operation and must show
reverse references before a recoverable delete.

### Creation and Add Component menus

Every authorable concept must be discoverable in the surface that owns it:

- Register a scene-attachable component in the categorized, searchable
  **Add Component** menu.
- Register a reusable asset type in the categorized **Project/Create** menu.
- Register both only when they are genuinely separate concepts.
- Put each entry in its responsibility category: Animation, Audio, Effects,
  Input, Mesh, Physics, Rendering, or another narrowly named feature category.
- Centralize label, category, description, availability, order, and icon
  metadata in the appropriate registry. Do not hard-code a second menu-only
  component list in React.
- Search must match the component label, category, and useful aliases.
- An unavailable entry must either be omitted because it already exists or be
  disabled with a useful reason. Never let a click fail silently.
- Creating or adding must call one named authoring operation so defaults,
  undo/redo, dirty state, and tests share one mutation boundary.

An asset is not a component. `Animator Controller` is intentionally a component
in Braze: put it in Add Component and persist its state machine with the scene
or prefab. Do not also expose it under Project/Create. Reusable Avatar Masks
remain Project assets.

### Icon contract

Every component needs intentional icon metadata for both of these contexts:

- **Hierarchy icon:** the compact glyph used in hierarchy rows and hierarchy
  component menus.
- **Component icon:** the glyph used by Add Component search/results and the
  Inspector component header.

Reusable assets also need a Project asset icon. The same glyph may serve more
than one context when it remains legible at each size, but each context must be
declared rather than receiving an accidental fallback.

Prefer the shared Lucide glyph set through `EditorIcon`. Add a custom asset only
when Lucide cannot communicate the concept at editor sizes. Icons must not be
the only carrier of state: include a text label and use accessible names for
icon-only controls.

Declare scene-component identity in
`src/scene/presentation/scene-component-registry.ts`. Render registered
Inspector sections and component-card headings through
`src/components/scene/SceneComponentPresentation.tsx`; do not repeat the
registry label or pass its icon directly to `EditorIcon`. Hierarchy indicators
and Add Component results consume the same registration. The architecture gate
rejects direct registered-component glyph usage unless the call site is a
documented non-component reuse.

### Component implementation contract

Before a component is complete:

1. Define one feature-owned domain type and one authoritative default factory.
2. Register add availability, category, presentation metadata, and icons.
3. Implement named authoring operations that participate in undo/redo and
   scene/prefab dirty tracking.
4. Build a feature-owned Inspector card using the shared scene-component
   presenter; do not add feature branches to the application shell.
5. Add a versioned decoder/encoder, validation, migration behavior, and
   round-trip tests. Preserve unknown extension data at extensible boundaries.
6. Store asset dependencies as `AssetRef`s and define Missing Asset behavior.
7. Decide prefab override, duplication, Play Mode snapshot/restore, and runtime
   disposal behavior explicitly.
8. Keep runtime state out of authored documents and importer metadata.
9. Prove the disabled hot path is constant-time and review active per-frame
   work against the GPU-residency rules.
10. Add focused unit tests and the relevant Inspector, Project, persistence,
    Play Mode, and browser integration coverage.


## GPU residency


**No per-body CPU work in the frame loop. No GPU→CPU readback in the frame loop.**

Concretely, per rendered frame the CPU must not:

- read back simulation results (`mapAsync`, `onSubmittedWorkDone` as a data dependency);
- iterate bodies, particles, or instances;
- allocate per-body objects (vectors, quaternions, matrices);
- write per-body transforms into scene-graph nodes;
- sort, map, or diff per-body collections.

Cost per frame must be **O(scene changes)**, not O(bodies). A scene of ten bodies and a scene of a hundred thousand should submit nearly the same commands. If a code path's cost grows with body count on the CPU, it is wrong regardless of how fast it currently is.

### What the CPU is still for

This is not a ban on the CPU. It is a ban on the CPU in the *hot loop*. These remain CPU work, and should stay there:

- authoring and editing: the inspector, gizmos, scene compilation, validation;
- one-time upload: turning authored scenes into GPU buffers (`physics/gpu/rigid-resources.ts`);
- lifecycle: creating and destroying runtimes, pipelines, and buffers;
- submitting command buffers and pacing frames;
- sparse gameplay commands (impulses, velocities, kinematic targets), uploaded only
  for changed bodies and consumed on the GPU;
- on-demand queries against authored static geometry through a cold-built BVH;
  this is never a CPU mirror of dynamic GPU poses;
- **bounded asynchronous capacity diagnostics** — a four-byte status sample at most once per second, outside solver dependencies;
- **selective, on-demand readback** — the selected object's transform for the inspector, a picking result. One object because the user asked, not every object because the frame ticked.

The test is not "did the CPU run" but "does this run per frame, and does it scale with N".


GPU poses bind through `three/physics/gpu-pose.ts` and eligible instances share
draws through `instanced-bodies.ts`. CPU scene transforms are not dynamic truth:
picking, labels and selected-object inspection need explicit bounded observation,
never per-frame body readback. Ask what any hot-path change costs at 100,000 bodies.
