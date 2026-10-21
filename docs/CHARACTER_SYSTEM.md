# Braze Character System

Status: normative architecture and current capability contract. Read this with
[`CODING_RULEBOOK.md`](./CODING_RULEBOOK.md),
[`ENGINE_ARCHITECTURE.md`](./ENGINE_ARCHITECTURE.md#assets-and-prefabs), and
[`ENGINE_ARCHITECTURE.md`](./ENGINE_ARCHITECTURE.md#scenes-and-play).

Braze treats a character as imported rig data, authored reusable assets, an
authored scene component, and a disposable playback session. Those lifetimes
remain separate. React edits documents; it does not evaluate skeletons or own
an animation clock.

## 1. Ownership and dependency direction

```text
model source + importer settings
            |
            v
immutable clip / skeleton / Avatar subassets
            |                         project.characterAssets
            |                         (Avatar Masks)
            +--------------------------+
                                       v
scene Animator component
(embedded controller) ---------> playback resolution snapshot
                                       |
                                       v
controller compiler -> layer plans -> clockless pose adapter
                                       |
                                       v
                           loaded scene-object clone only
```

The domain, codecs, controller compiler, compatibility rules, retarget planner,
event collector, and root-motion math do not import React or Three.js. Three.js
loading, skeleton binding, clip baking, mixer actions, and pose restoration stay
behind adapters.

## 2. Asset model and identity

All durable references use `{ guid, localId }`; names and paths are display
metadata, never lookup authority.

| Asset | Owner | Identity and persistence |
| --- | --- | --- |
| Model source | Asset Database | source GUID plus `main` |
| Skeleton facts | model importer | stable bone IDs, readable paths, bind pose, topology signature |
| Avatar | model importer | model GUID plus stable `avatar:*` local ID and persisted rig intent |
| Animation clip | model importer | model GUID plus stable `clip:*` local ID and source animation index |
| Animator Controller | scene Animator component | stable ID, revision, versioned embedded document |
| Avatar Mask | project character library | authored GUID, revision, versioned codec |
| Animator component | scene object | versioned embedded Controller plus references and instance policy |

Importer local IDs are semantic. They are not Three.js UUIDs or array indexes.
The source index is retained only as a loader adapter detail after the durable
reference has resolved.

Imported rig artifacts are rebuildable derived data in `.braze/Library`; the
source model and its sidecar remain authoritative. Controllers are scene-owned
component data. Reusable Masks live in the independently revisioned
`characterAssets` project section. Unknown document fields round-trip so a
newer editor does not destroy data an older editor does not understand.

## 3. Rig import contract

The model importer supports three explicit modes:

- **None** imports static geometry. A detected skin produces a diagnostic
  instead of silently inventing character semantics.
- **Generic** preserves an arbitrary hierarchy. Animation reuse requires an
  exact topology and bind-pose compatibility signature.
- **Humanoid** maps source bones onto semantic human slots and produces a
  validated Avatar used for retargeting.

The importer owns root selection, a separate motion root, skin influence
limits, blend-shape inclusion, and Avatar source. Skin weights above the
selected one/two/four influence limit are pruned and renormalized. Invalid
weights are repaired with diagnostics. A skinned hierarchy is never flattened.
Bone optimization remains unavailable until a generated transform-remap
artifact exists; enabling a destructive fake optimization is not permitted.

The source analyzer records skeleton roots, stable bones and parent edges,
skins, joint sets, inverse-bind facts, morph targets, animation bindings, and
targeted diagnostics. glTF 2.0, GLB, and FBX publish the durable Model, Clip,
Skeleton, and Avatar catalog contract. The FBX path filters empty takes and
keeps repeated display names unambiguous through full hierarchy paths. Other
model formats can load through the Three compatibility path, but they are not
considered full character-import parity until they publish the same contract.

Each detected topology is published as its own stable `skeleton:*` catalog
subasset, and the corresponding `avatar:*` subasset stores that exact local ID
as `skeletonLocalId`. The catalog artifact records only the topology,
rest-transform, skin, joint, and inverse-bind facts that its source-format
analyzer can prove. It never fabricates matrix values that were not decoded.
The runtime reconstructs exact bind matrices from the loaded model resource;
Avatar records temporarily mirror the derived skeleton facts for compatibility
with existing editor and runtime consumers.

Animation import has two distinct controls. **Import Animation** enables or
disables every clip from the model. **Loop** is a per-clip override stored in
the model import sidecar against the clip's stable local ID, not its display
name or source index; absent an override, the importer-published source value is
used. Duplicate clip names are disambiguated only for display. A model import
document accepts at most 1,024 per-clip setting entries.

Disabling **Import Animation** retains the derived clip records and marks them
`importEnabled: false`. Disabled clips are omitted from new Controller motion
choices. A Controller that already references one fails playback with the
specific `animation-clip-import-disabled` diagnostic instead of silently
choosing another clip or falling back to a name match.

Importer loads and saves are owned by a model-selection generation. Changing
from model A to B immediately clears A's draft, and a late A load or save
completion cannot update B, clear B's dirty state, or invoke B's save callback.
This applies equally to an A-to-B-to-A selection sequence; identity equality
does not revive an obsolete request.

Before character extraction or rig policy mutates a loaded Three model, one
iterative scan validates the complete work shape. It runs before
`updateMatrixWorld`, vertex inspection, skin-plan typed-array allocation,
weight normalization, or morph stripping. Rejection returns structured
diagnostics and leaves the model untouched.

| Loaded character-model dimension | Limit |
| --- | ---: |
| Objects / hierarchy depth | 10,000 / 256 |
| Skinned meshes | 64 |
| Bones per Skeleton / unique bones | 1,024 / 2,048 |
| Skin vertices per geometry | 500,000 |
| Unique / inspected skin vertices | 1,000,000 / 2,000,000 |
| Planned per-variant skin vertices | 1,000,000 |
| Morph attribute channels per mesh | 16 |
| Morph bindings / morph names | 1,024 / 2,048 |

These limits protect character processing after Three has loaded and parsed a
model. They do not prevent the loader itself from allocating source bytes or a
glTF parser graph; download and parser admission remain asset-loader concerns.

## 4. Avatar configuration

The Avatar configurator uses the real imported clone and exposes:

- orbit, pan, zoom, reset view, and bounded render resolution;
- skeleton overlay and stable clickable bone handles;
- skeleton root and motion-root selection;
- hierarchy-aware auto-mapping plus manual mapping for body, limbs, and fingers;
- hierarchy, duplicate, stale-bone, and required-bone validation;
- imported clip selection, play/pause, scrubbing, and pose reset.

Apply is disabled while validation is invalid. Cancel does not mutate importer
settings. The preview owns no private `requestAnimationFrame`; it participates
in the shared `EngineLoop` and requests another frame only while playback or a
camera interaction needs one.

Opening the full-workspace configurator suspends covered editor viewports.
Playback state updates only the transport surface; the mapping cards and
preview canvas are memoized away from the timecode cadence. Manual mapping
uses one searchable, on-demand bone picker instead of retaining an option node
for every imported bone in every Humanoid slot.

Auto-mapping first selects one complete skin-local skeleton and then scores
semantic aliases together with parent-child connectivity. This keeps FBX files
that repeat the same Mixamo hierarchy for multiple skinned meshes on one
coherent branch. Persisted mappings continue to use stable path-derived
`BoneId` values rather than ambiguous display names.

**Copy From Another Avatar** resolves the exact source reference, copies its
validated semantic mapping into target bone identity, and validates that
mapping against the target skeleton. A stale source or a mapping that does not
fit the target cannot be accepted merely because a source label still exists.

Humanoid compatibility is semantic: required slots, reference pose, character
scale, and axis alignment compile into a deterministic retarget plan. Generic
compatibility is deliberately stricter and never falls back to name guessing.

## 5. Animator authoring

Agent scene/live/prefab authoring supports complete embedded Animator documents
through `component.set` (`component: "animator"`) and `component.remove`.
Discover the recursive schema and limits in capabilities. Operations use this
feature's codecs, graph validation, budgets and model eligibility, then the
existing scene or prefab history/persistence owner. Preserve stable IDs and
`behaviorMap` layout when replacing a document. Clip/Avatar/mask dependencies and
runtime-only limitations are assessed in Play/export; successful authoring does
not certify playable animation. Saved prefab inspection returns encoded components
suitable for another command. Behavior Map layout node IDs are `entry`,
`any-state`, `exit`, `state:<stateId>` or `state-machine:<childMachineId>`.
`stateMachineId` identifies the containing scope; omit it for the layer root.
Positions are graph canvas x/y coordinates. Unknown scoped node references reject.

An Animator Controller owns typed scalar parameters, ordered layers, recursive
state-machine scopes, leaf states, motions, transitions, and the authored
Behavior Map. Every child state machine owns its direct states and child
machines, a scoped Entry target, scoped Any State transitions, and Exit routes
back into its parent scope. Controller parameters remain shared across the
entire Controller; drilling into a child machine does not introduce a second
parameter namespace. The Behavior Map persists state-machine-scoped graph
positions only and never becomes a parallel runtime graph. An Avatar Mask owns
humanoid body regions and optional stable bone/path entries. The scene Animator
component owns its Controller together with per-instance options: enabled
state, parameter overrides, update mode, culling mode, and root-motion policy.

The dock-native Behavior Map is composed from feature-owned rails, graph,
connection renderer, node, Motion Space, preview, and contextual Inspector
components under `character/components/animator-workspace`. React invokes
named application authoring operations; it does not parse documents or compile
runtime state during render. State-machine topology, transition priorities,
crossfades, exit windows, and interruption policy persist through the
Controller codec; scoped node positions persist through the Behavior Map.
Right-clicking blank graph space creates a child state machine at that world
position. Double-clicking its node drills into that scope, and the toolbar
breadcrumb returns to any ancestor. Every scope presents its own Entry,
Reaction Router (Any State), and Exit nodes; the root Exit means exit the layer,
while a child Exit follows the child machine's authored parent-facing routes.
The graph does not compile a parallel runtime representation. Its viewport is
an unbounded two-axis pan and bounded zoom surface with a viewport-sized SVG
grid. Camera position, zoom, and in-progress drag positions are disposable UI
state; a node move is persisted once on release while connectors follow the
transient position every frame. Node positions are signed world coordinates,
so crossing the initial origin never creates a visible workspace boundary.

Opening a scene Animator pins that scene-object identity in a feature-owned
workspace session and activates the reusable Behavior Map dock. The Controller
continues to resolve from canonical scene or Prefab state on every render;
Inspector selection changes never replace the pinned document and the dock
does not retain an Inspector callback or Controller snapshot. The pane defaults
to the lower workspace so Scene or Game remains visible, can be moved like any
other dock, and uses the dock system's generic maximize/restore projection.
Maximizing never rewrites the persisted dock tree or mounts a second Animator
workspace, so graph selection, viewport state, and simulation state survive
the round trip. Inactive or closed panes cancel preview-loop work.

Default placement and Auto Arrange share the application-owned policy in
`animator-graph-layout`; React does not duplicate layout coordinates. The graph
model reports actual content bounds rather than a fixed virtual canvas, while
the viewport independently owns its visible size and camera transform.

Motion Space visualizes and previews Float-driven 1D and 2D blend trees
directly. A 1D tree reads one shared Float Controller parameter; a 2D tree reads
two independently authored Float parameters for its X and Y axes. Gameplay
writes those scalar parameters through the Animator command port. Input Actions
may coordinate a pair of values for movement, look, or aim, but keyboard,
joystick, touch, and device binding remain exclusively owned by Input Actions.

Layers evaluate in serialized order from low to high. Layer zero is always a
weight-1 Override layer at runtime, regardless of legacy or future authored
weight/blend values; the Inspector presents those base-layer controls as fixed.
Each later Override layer interpolates over the accumulated lower result.
Each later Additive layer contributes additive tracks without attenuating the
lower result. A layer's Avatar Mask first removes tracks outside that layer;
therefore a higher Override attenuates lower contributions only for tracks its
mask includes. A still-higher Override attenuates every earlier Override or
Additive contribution on the tracks it includes. The Three compatibility
adapter compiles these ordered, track-local factors before handing actions to
`AnimationMixer`, avoiding the mixer's default global averaging of normal
actions.

The editor must not expose a controller option as editable until the compiler,
pose backend, codec, and tests all support its semantics. Unsupported values
loaded from a future or legacy document are preserved read-only and produce a
specific diagnostic.

The scene **Add Component** menu offers Animator only on fully analyzed
FBX/GLB/glTF model roots with a durable `main` asset reference and an available
source. An analyzed FBX is eligible when it publishes at least one Avatar or
Clip; warning-only `dirty` status does not hide otherwise usable character
data. USD(Z) can load as a Three model body, but does not expose Animator
authoring until its importer publishes the same clip/Skeleton/Avatar contract.
If a legacy scene already contains Animator on another object or on a
missing/sub-asset source, the component is retained and shown with a read-only
Inspector diagnostic; it is never silently deleted, and the author may still
remove it explicitly.

Placing a model with one unambiguous configured Generic or Humanoid Avatar
adds a disabled-by-configuration-safe Animator assignment for that exact
Avatar. It never guesses a Controller or animation clip. Existing scene
instances are not retrofitted during catalog reconciliation because doing so
would also re-add an Animator the author intentionally removed.

The Animator Inspector opens its embedded Controller directly. **Build From
Clips** is the intentional one-click path for a newly placed animated model: it
creates one state per enabled imported clip, assigns each stable clip
reference, and makes the first state the default. A blank Controller remains
blank until the user authors a state and motion; Play Mode reports that
configuration instead of silently selecting a clip. Pre-embedded Controller
references remain a decode/playback migration path only and are embedded on
the next explicit edit; new authoring never creates that shape.

Avatar Mask edits use Character-library-owned history capped at 100
checkpoints. Embedded Controller edits participate in scene authoring history.
Any local Undo/Redo surface scopes keyboard shortcuts and preserves native
text-input undo. Initial Mask-library hydration establishes a new history base;
canonical acknowledgement rebases history so Undo cannot erase independent
remote fields.

## 6. Runtime evaluation

At Play entry the world first freezes the enabled authored Animator objects,
then waits until Character-library hydration and the latest imported-asset
refresh are both ready before capturing the asset catalog. Delayed readiness
therefore cannot admit later authoring edits. A failed or superseded refresh
cannot publish stale readiness. Viewport-runtime replacement reuses the same
immutable Play snapshot; only returning to Edit establishes a new capture
boundary.
Embedded Controller, Mask, clip, model-import, and Avatar revisions belong to
that snapshot. The captured catalog contains only assets reachable from the first
32 enabled Animators, including copied-Avatar validation metadata; unrelated
project and imported assets are not cloned. Authoring changes made during Play
do not mutate the live session, and enabled Animators beyond the world
session budget receive an explicit capacity diagnostic.

The shared browser loop calls Normal/Unscaled animation once in the simulation
phase. Fixed Step follows admitted physics ticks when the scene has physics.
The world-owned runtime:

1. advances deterministic controller state using typed parameters;
2. evaluates nested clip and blend-tree motions within depth/node/sample caps;
3. produces compact per-layer clip samples;
4. applies override/additive layers and Avatar Masks through a clockless pose
   backend;
5. samples/removes root motion and sends it to one explicit transform owner;
6. applies ordered Humanoid IK passes after root-motion ownership is resolved;
7. reports crossed clip/state events through a bounded event port;
8. exposes extracted root motion to bounded observers when requested;
9. requests rendering only when a pose changed.

Normal and unscaled modes clamp extreme frame gaps. The app-wide `EngineLoop`
owns one bounded global time scale. Normal and Fixed Step consume scaled time;
Unscaled Time consumes the same frame's unscaled clock. A zero scale stops
continuous frames unless at least one live Animator uses Unscaled Time.
Fixed-step mode uses the shared fixed-step clock, caps catch-up work, and
reports discarded time. Pause holds runtime state. Step advances exactly one
fixed frame. Stop disposes every session and restores the captured authored
transform, bone pose, scale, and blend-shape values.

No runtime evaluation writes React state or persisted scene objects per frame.
Body replacement and asynchronous model completion use a narrow reconciliation
lifecycle event; playback does not scan the authored scene on every frame.

All local and retargeted tracks are canonicalized into one body-root binding
space before mixing. Clone-stable unique names replace UUID authority;
ambiguous duplicate names, unresolved targets, or conflicting samples fail
closed. Higher Override coverage is computed per target property, so an upper
layer cannot attenuate a lower Arm, Leg, material, or morph channel that it
does not actually drive. Prepared clips retain the imported source duration.
An apply is transactional: a mid-plan failure disables and stops touched
actions, restores saved properties, removes newly created groups/actions/empty
mixers, refunds their cache budget, and leaves no partially active pose.

### Shared world gameplay binding

Each mounted `ThreeScene` publishes the same world-owned `AnimatorPlaybackBinding`
through `onAnimatorPlaybackBindingChange`. Viewports attach pose presentation;
closing a pane does not dispose controller state, replay events, or reset parameters.
The main-scene transport owns Play/Stop and suspends advancement when all views close.

The binding exposes parameter/trigger commands, events, IK goals, root-motion motor
registration, runtime trace and diagnostics. The event publisher permits 32 listeners
per world and isolates listener failures. Runtime subscriptions and motors are
cleared at Stop; subscribers register again for the next Play lifetime.

Gameplay modules use `context.animation` with generation-checked entity handles.
See [World-owned animation](./GAMEPLAY_RUNTIME.md#animation-commands) for ownership, fixed-tick ordering,
asset lifetime, suspension, API examples and remaining bounds.

## 7. Retargeting and cache policy

Humanoid retargeting compiles a plan from source and target Avatar revisions,
skeleton compatibility signatures, reference rotations, axis alignment,
per-bone muscle limits, twist tuning, and human scale. The complete identity
forms a deterministic cache key. A Three adapter bakes a target clip from an
isolated source clone and restores every temporary source/target pose even when
baking fails.

Reference rotations are composed through the complete skeleton hierarchy; a
bone-local offset is not treated as though it were a global orientation. Each
source joint delta is expressed in the Avatar's declared canonical frame,
encoded as a bounded three-axis normalized rotation-vector muscle, and decoded
through the target Avatar's limits and reference frame. Root translation uses
the declared axis conversion and human-scale ratio. A source reference pose
therefore lands exactly on the target reference pose even when reference
rotations and axis conversion do not commute.

Named twist/roll helpers between mapped arm and leg joints receive a bounded
share of axial motion according to the target Avatar's twist tuning. Non-root
target translations remain authored; the system does not invent bone-length
changes. This is Braze's documented normalized muscle representation, not a
claim of bit-identical compatibility with Unity's proprietary Humanoid solver.
Newly built imported Avatars currently use +Z forward/+Y up and full-rotation
default muscle limits; codecs and runtime APIs retain custom axes and limits,
while the model-import Inspector does not yet expose those advanced controls.

Generic animation reuse first proves exact skeleton compatibility. Direct
track binding is allowed only after that check; an incompatible Generic
skeleton is an error, not a best-effort name match.

Caches have explicit bounds and session ownership. Failed entries are not kept.
The process-wide retarget cache is LRU by both count and measured typed-array
storage: at most 64 clip sets and 32 MiB total, with no more than 8 clips, 704
tracks, or 8 MiB in one set. Backing buffers are counted once within a clip
set; unsupported storage and oversized sets play from the completed bake but
are not retained, with a structured warning. Replacing a key with a rejected
entry removes its stale predecessor. Model sources use existing leased
asset-cache lifetime; playback does not create a second unbounded loader cache.

The synchronous Three bake fails closed before cloning or sampling when its
preflight budget is exceeded. The estimate follows SkeletonUtils' actual inner
shape: sampled frames multiply its target-bone/source-bone name scans, target
track writes, and per-target mixer-track evaluation. It is a deterministic
compatibility budget, not a wall-clock guess.

SkeletonUtils transfers bone animation only. An external Humanoid clip that
also contains facial or morph-target tracks reports
`external-retarget-morph-tracks-unsupported`; those channels are not silently
claimed as retargeted. Morph tracks authored for the same local model still use
the canonical binding space normally.

## 8. Root motion and transform ownership

Root motion is disabled, extracted only, or applied to the scene-object root.
The source may be imported clip metadata, the configured motion root, or
Humanoid hips. Translation axes and rotation policy are explicit. Loop
boundaries are sampled so wrapping does not create a teleport delta. A single
continuous base sample supports any safe signed number of forward or reverse
cycle crossings in one step; repeated cycle transforms are composed in
logarithmic work rather than iterated once per cycle.

Loop correction is intentionally conservative. If multiple blended base
samples cross a boundary in the same step, the cycle count exceeds safe integer
precision, the backend cannot sample a boundary, or an instantaneous state
change replaces the sample identity, root-motion extraction resets for that
step and emits a diagnostic. Braze skips that ambiguous delta instead of
guessing and teleporting the character.

When motion is removed from the animated pose, the selected channels return to
their authored reference values. Applying motion requires exactly one sink.
A physics-owned body cannot also receive direct Three transform root motion;
kinematic Rigidbody characters have a character-motor adapter contract, which
writes every compound collider target without GPU readback. Dynamic bodies and
custom locomotion controllers register one explicit motor through the world
binding. Until then extraction continues and a warning is reported without
creating a second transform owner.

Step 14 supplies an explicit motor sink for runtime character-model prefabs,
resolved from their entity handle. Translation and yaw apply through the same
static collision motor as authored characters. Full applied rotation rejects
for the upright runtime capsule; disabled/extractOnly remains valid. Dynamic
runtime model bodies still reject applyToObject. Removal and pool return end
the Animator and motor together; reacquire resets both state and sample cursors.

Root motion is observed/applied before procedural IK. Humanoid IK supports
weighted hand/foot positions and rotations, optional elbow/knee hints, and
ordered per-layer IK Pass evaluation. Foot IK stabilizes feet already within a
bounded contact band around the captured local floor; terrain raycasts and
predictive foot placement remain gameplay-system responsibilities.

## 9. Character Controller foundation

The scene Character Controller is a small authored ownership component, not a
second physics definition. It stores only enabled state and the stable ID of
its Capsule Collider. The linked Collider owns shape, dimensions, axis,
friction, and gizmo state; the linked Rigidbody owns body type and physics
policy. Scene and prefab codecs preserve that separation.

Adding Character Controller is one atomic authoring operation. It reuses an
enabled Capsule Collider when one exists, otherwise creates an upright
Y-axis capsule, and creates or normalizes an enabled gravity-free Kinematic
Rigidbody. It refuses to silently replace an active Dynamic Rigidbody. The
Inspector exposes the linked capsule and a repair action if either backing
component becomes invalid. Removing Character Controller deliberately keeps
the separately authored Collider and Rigidbody.

The kinematic motor owns the command pose and writes collider targets without
GPU readback. Animator root motion and explicit character displacement commands
share this boundary. The Character Controller requires one world-upright capsule
and supports wall sliding, slope limits, stairs, ground snapping and overlap
recovery against static geometry. Gameplay supplies gravity and jump displacement.
Stop/Edit clears pending root deltas and cached motor sinks so movement cannot
leak into a later Play session. The optional
[`gameplayEntry` host](./GAMEPLAY_RUNTIME.md) connects action input and a
caller-clocked gravity/jump policy to this same motor. Dynamic obstruction and
moving-platform carry remain unsupported.

Step 14 captures the existing authored controller into `RuntimeCharacter` for
saved prefab leaves and programmatic entity commands. Supported leaves are
cube/sphere visuals or imported models, backed by one solid Y-axis capsule and
an enabled Kinematic Rigidbody with interpolation None. The compiler reuses
existing authored defaults and world-transform compilation, rejecting tilt,
shear, incompatible scale/backing components and full applied root rotation
before allocation. Disabled controllers remain inert only on otherwise valid
render-only or dynamic leaves; generic kinematic-body creation is not exposed.

The descriptor freezes world position/yaw, scaled capsule offset/dimensions,
movement and collision settings. `characters.move(handle, displacement)` reaches
the committed runtime motor through the same fixed-tick port and budget. Motor
registration and cached results follow preparation, publication, rollback,
removal, pool return/reacquire and Stop. Model materials own imported appearance;
primitive rendering remains independent of the capsule shape. No new authored
component, Inspector surface or asset format is introduced.

Registered project behaviors and `createCharacterLocomotion` can configure and
compose movement through public ports. Step 15 implements authorable stock
first-person, third-person and top-down movement/cameras through saved registered
Behaviors, typed policy factories and explicit character/camera leases. These
factories accept injected ports and custom facing/camera policies; project
scripts can configure, reuse or replace them. See
[GAMEPLAY_RUNTIME.md](./GAMEPLAY_RUNTIME.md#stock-controls-and-character-commands). Step 15 full automated verification passed; manual acceptance remains pending.
This is not an arbitrary component mutation or attachment API. Step 14
implementation is complete and full automated verification passed; manual
acceptance remains pending in its [review](./OPERATIONS.md#manual-review).

## 10. Supported controller semantics

The supported surface is recorded here so UI and runtime claims remain honest.

| Capability | Status |
| --- | --- |
| Float, integer, boolean, trigger parameters | supported |
| Shared Controller parameters across every state-machine scope | supported |
| Recursive nested state machines with scoped Entry, Any State, and Exit routing | supported |
| Ordered states, exit time, typed conditions | supported |
| Fixed/normalized transition duration and destination cycle offset | supported |
| Ordered Override/additive layers and track-aware Avatar Masks | supported; base is fixed full-weight Override |
| Clip, 1D, Simple Directional 2D, Freeform Directional 2D, Freeform Cartesian 2D | supported |
| Direct and nested blend trees | supported |
| State speed/cycle parameters and clip time-scale parameters | supported |
| Imported clip events and authored state events | supported through bounded event delivery |
| Root-motion extraction, filtering, loop correction, and explicit sink | supported |
| State/blend-child Humanoid mirroring | supported through semantic left/right track reflection |
| Humanoid hand/foot IK, hints, Foot IK, and ordered Layer IK Pass | supported by bounded analytic compatibility solver |
| Synchronized layers and timing contribution | supported |
| Higher-layer Exit transitions | supported; base layer cannot exit |
| Source/destination and ordered transition interruption | supported |
| `writeDefaults = false` property retention | supported per layer/property |

## 11. Performance boundary

The current Three `AnimationMixer` pose adapter is a bounded compatibility
backend for editor preview and modest gameplay character counts. It avoids
private frame loops, duplicate source loads, unbounded actions, unbounded event
delivery, and stale sessions. Visibility culling provides a constant-time skip
for inactive characters.

The compatibility budget is explicit: at most 32 live Animator sessions per
world, 128 cached mixer actions and 256 cached action groups per pose target,
288 model dependencies (32 target models plus 256 external models) and four idle
external source leases per Play snapshot, and up to 64 process-wide immutable retargeted clip sets within a
32 MiB typed-array budget. The coordinator retains at most 256 unique
diagnostics. Standard sessions clamp a display gap
to 0.25 seconds, run at most five fixed steps per frame, and deliver at most
128 combined clip/state events per character per frame.

Three clip preparation has independent reject-not-grow budgets:

| Three animation resource dimension | Limit |
| --- | ---: |
| Clips resolved per character | 256 |
| Bindings per clip resource | 8 |
| Tracks per resource | 512 |
| Keyframes / values per resource | 262,144 / 1,048,576 |
| Cached canonical tracks per character | 4,096 |
| Cached prepared tracks per character | 4,096 |
| Cached keys / values in each cache | 262,144 / 1,048,576 |
| Indexed binding objects / depth | 10,000 / 256 |

The production build gives `character/adapters/three` and `character/runtime`
their own budgeted split group. This preserves the entry-chunk budget without
changing runtime ownership or introducing a second clock.

Controller compilation also rejects graphs beyond these compatibility limits:

| Dimension | Limit |
| --- | ---: |
| Parameters per Controller | 256 |
| Layers per Controller | 32 |
| States per layer across all state-machine scopes | 256 |
| Nested state machines per layer | 256 |
| State-machine depth below the layer root | 8 |
| Persisted graph nodes per layer | 1,283 |
| Compiled transitions per layer | 2,048 |
| Conditions per transition | 16 |
| Authored state events per state | 256 |
| Imported/persisted animation events per clip | 256 |
| Payload entries per animation event | 32 |
| Blend-tree depth | 8 |
| Children per serialized/authored blend-tree node | 256 |
| Total motion nodes per state | 256 |
| Active clip samples in one runtime blend plan | 256 |

Crossing a session, asset, action, event, or graph limit rejects or truncates
work with a structured diagnostic; budgets are not silently raised according
to scene size. Event truncation advances its cursor, so an over-budget frame
does not create an unbounded retry backlog.

Persisted Animator documents use reject-not-truncate semantics for these graph
budgets, including the 256 parameter overrides allowed on one Animator
component. The total motion-node budget counts the root motion, so it is tighter
than the per-node child-array budget for a flat valid tree: one blend-tree root
can contain at most 255 leaf motions even though any serialized child array is
independently rejected only above 256 entries.

Synchronous Humanoid retarget baking has a separate fail-closed budget:

| Retarget bake dimension | Limit |
| --- | ---: |
| Clip duration | 120 seconds |
| Sample rate | 12-120 Hz |
| Sampled frames | 3,600 |
| Mapped Humanoid bones | 55 |
| Twist/roll helper bones | 32 |
| Target skeleton identities | 8 |
| Source skeleton bones | 512 |
| Target bones | 512 per skeleton; 1,024 combined |
| Source tracks | 512 |
| Source keyframes | 262,144 |
| Source track values | 1,048,576 |
| Predicted baked time samples | 524,288 |
| Predicted baked track values | 2,000,000 |
| Predicted/cacheable typed-array storage | 8 MiB per bake |
| Estimated synchronous work | 16,000,000 units |

A positive tiny clip that would otherwise create zero or one SkeletonUtils
frame is raised only as far as needed to produce two samples within the 120 Hz
cap. Clips shorter than 1/60 second are rejected with a diagnostic. Zero or
non-finite durations are invalid. This prevents SkeletonUtils from dividing by
a zero-frame span while retaining ordinary short gameplay clips.

The Project pane is a single asset browser; it does not host a separate
Character subwindow. Selecting an imported model exposes Model, Rig, Animation,
and Materials import settings in that asset's Inspector, matching the normal
asset workflow. The Animator component opens its embedded Controller in the
docked Behavior Map while Scene or Game remains available for character
feedback. Reusable Masks continue to use their focused Project asset editor.

It is not the final high-crowd backend. Large crowds require a compact pose
representation, batched skeleton evaluation, palette storage, and GPU skinning
without one JavaScript mixer/object graph per character. That backend must
implement the same controller plan and pose ports; it does not require moving
controller logic into React or replacing authored formats.

Nor is the current Humanoid path bit-identical Unity feature parity. It provides
semantic mapping, validated normalized muscle retargeting, twist helpers,
Humanoid IK/Foot IK, synchronized layers, interruption, exits, mirroring, root
motion ports, and the Controller surface listed above. It does not yet provide
a production crowd backend, terrain-query foot placement, or advanced
muscle-limit/axis authoring in the import Inspector. Generic rigs remain
exact-topology compatible rather than automatically retargeted. These
boundaries are explicit rather than hidden approximations.

## 12. Verification requirements

Character changes are complete only when the applicable evidence exists:

- importer artifact stability and malformed-source diagnostics;
- loaded-model work-limit boundaries and rejection-without-mutation tests;
- stable per-clip Loop settings, duplicate-name handling, disabled-import
  filtering, and explicit stale-reference failure;
- rig/Avatar/Controller/Mask/component codec round trips and migration tests;
- Character history, canonical acknowledgement rebase, and native-input
  keyboard isolation tests;
- Humanoid mapping and Generic compatibility tests;
- 1D/2D/Direct/nested blend and transition determinism tests;
- base-layer invariants and ordered, mask-aware Override blending tests;
- retarget cache identity, axis, scale, and pose-restoration tests;
- fixed-step cadence, event/listener caps, viewport command routing, signed
  multi-cycle root-motion, discontinuity, pause/Step/Stop tests;
- Controller graph, session, action, source-model, and cache-capacity tests;
- catalog readiness, immutable reachable-only Play snapshots, and stale async
  completion tests;
- asynchronous body replacement and disposal tests;
- editor assignment and authoring-flow browser coverage;
- architecture, complete test, build, soak, and browser gates.

Manual visual checks still verify bone picking, mapping readability, masked
motion, transition smoothness, and Stop restoration on a real skinned model.
They supplement the automated gates and are never replaced by a planning
checkbox.

## Physics integration boundary (2026-09-29)

The impulse rigid backend supports kinematic bodies and capsule colliders.
Character commands return a constrained command pose using static geometry;
they do not read dynamic GPU poses. Dynamic props can respond to the submitted
kinematic targets, but the character's CPU sweep does not see moving bodies.
Human input and gameplay gravity/jump are available through the optional
[`gameplayEntry` host](./GAMEPLAY_RUNTIME.md); moving-platform carry remains open.
Step 14 adds runtime-created and pooled character capsules to that same boundary,
including explicit Animator root-motion sinks, without raising world/animation
capacities or reading moving GPU poses. Full automated verification passed;
manual acceptance remains pending.
Step 15 adds copied command-pose snapshots and atomic movement/yaw ownership
over the same static motor. Script movement leases reject enabled applied
Animator root motion; stock locomotion uses disabled/extractOnly root motion.
Dynamic GPU obstruction/platform carry remain unsupported.
There is no legacy physics fallback. See [PHYSICS_ENGINE.md](./PHYSICS_ENGINE.md)
and the tracked [runtime gaps](./STATUS.md).
