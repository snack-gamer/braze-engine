# Braze Engine Architecture

Status: normative foundation contract. Read this with
[`CODING_RULEBOOK.md`](./CODING_RULEBOOK.md) and
[`CODING_RULEBOOK.md`](./CODING_RULEBOOK.md#gpu-residency). Character import, authoring, and
playback additionally follow [`CHARACTER_SYSTEM.md`](./CHARACTER_SYSTEM.md).
Asset identity, importer metadata, and filesystem reconciliation follow
[`ENGINE_ARCHITECTURE.md`](./ENGINE_ARCHITECTURE.md#assets-and-prefabs).

Braze is an editor, an authored-data system, and a WebGPU runtime. Those are
different systems with different lifetimes. Scalability depends on preserving
their boundaries rather than letting React, Three.js, the filesystem, or a
single application file become the owner of everything.

This document describes the foundation that new engine features must join. It
does not claim feature parity with Unity; it defines the contracts required to
grow toward a production engine without replacing the foundation later.

## 1. System boundaries

```text
React editor surfaces
        |
        v
authoring operations -----> history transactions
        |
        +-----> versioned codecs -----> revisioned document stores
        |
        +-----> change plans ----------> Three/WebGPU runtime
                                             |
timeline samples ---> shared engine loop ----+----> demand-driven render
                                             |
                                     leased GPU resources
```

Dependency direction remains:

```text
UI -> application/authoring -> domain <- serialization
                           |
                           v
                     runtime ports
                           ^
                           |
                  Three/WebGPU adapters
```

### Game UI boundary

`src/game-ui` owns versioned screen-space documents, validation, authoring edits,
Play state/actions/tweens, and DOM presentation. Scenes/prefabs persist UI Canvas;
Inspector and automation share the same parsers. `context.ui` captures an isolated
Play copy. Browser surfaces subscribe to sparse changes and can detach/rebuild
without resetting the world. Native controls remain outside React reconciliation
and GPU pose state; fixed gameplay ticks own action delivery, controller navigation
and tween time. UI assets resolve stable GUIDs against a Play-captured imported
catalog. Surface-owned font faces/listeners retire on detach; late loads cannot
revive an ended surface. Editor Play passes its asset catalog explicitly; the
player and Inspector consume the shared read-only catalog provider.
See [responsive UI](./GAMEPLAY_RUNTIME.md#responsive-game-ui) for bounds and gaps.

### Platform contract

Braze is intentionally WebGPU-only. A browser must expose a usable WebGPU
adapter and device that meet the engine's documented baseline; otherwise the
runtime does not start and presents a structured unsupported-platform
diagnostic. Do not add a WebGL renderer, CPU simulation renderer, or another
backend as an automatic compatibility fallback.

WebGPU-only does not mean every adapter has identical features or limits. One
device-owned capability profile resolves required features, optional features,
and effective capacity when the device is created. Runtime systems consume
that profile instead of scattering feature detection throughout the engine.
Because the application supplies Three with an existing device, the browser
session explicitly intersects the adapter with the reviewed Three r184 feature
set. This preserves core-mode limits, texture compression, filtering, shader
f16, and related renderer capabilities when available. Timestamp queries are
the sole policy exception: they are requested only for an explicit diagnostic
session because Three's timestamp tracking adds work to render passes.
The current required baseline is `core-features-and-limits`, at least 256
compute invocations per workgroup, a workgroup X dimension of at least 256, and
at least two vertex-stage storage buffers. Those limits come directly from the
Physics and GPU-particle shader contracts. Compatibility mode is rejected until
those systems have separately tested compatibility variants.
An optional effect may take a documented WebGPU path with reduced quality, but
a required capability fails before gameplay begins. Requested limits and
allocated capacities stay within the active adapter's reported limits and
produce actionable diagnostics when they cannot.

The application shell composes these systems. It is not itself an authoring
service, codec, resource cache, runtime, or component implementation.

## 2. State ownership

Every value has one owner.

| State | Examples | Owner | Persisted |
| --- | --- | --- | --- |
| Authored | objects, components, materials, physics settings | editor/project model | yes |
| Runtime | velocities, contacts, particle state, GPU poses | play/runtime session | no |
| Derived | animation plans, reconcile plans, imported clones | producing cache/session | no |
| UI preference | pane layout, overlays, low-resolution view | editor preference feature | only as a preference |

Play Mode observes a snapshot of authored state. Runtime results never become
authored data implicitly, and exiting Play Mode discards runtime-only state.
Named authoring operations are the boundary for dirty tracking and undo/redo.

Project source updates terminate at the virtual game-module HMR boundary. The
boundary replaces only the loader used by future Play/discovery, retaining active
world closures and editor provider identity. Production builds keep ordinary
compiled imports. Project modules may re-evaluate; top-level resource acquisition
is prohibited by the public lifecycle contract.

Character Animator authoring follows the same split. The scene component owns
the embedded Controller; `character/application` owns Behavior Map, nested
state-machine, transition, and Blend Tree edits; `character/serialization` owns
bounded decoding; and the modular
workspace under `character/components/animator-workspace` only composes those
operations. Persisted graph layout, nested state machines, and Float-parameter
Blend Tree bindings are authored data.
Live graph traces, simulated values, viewport transforms, and drag previews are
disposable UI/runtime state. Graph connectors consume drag previews so they
remain live, while the authored node position crosses the persistence boundary
only when the gesture commits.
The docked Animator workspace stores only a pinned scene/Prefab object identity;
it resolves the current embedded Controller through canonical authored state.
Dock focus mode is an ephemeral frame projection over the existing mounted pane
and never becomes scene data or a rewritten persisted dock tree. Hidden panes
are not runtime-active and must cancel their EngineLoop participation.
Default graph placement and Auto Arrange are one application policy; content
bounds come from the graph model, while visible viewport dimensions remain a
presentation concern.

## 3. Persisted document contracts

### Scene documents

The canonical scene envelope is `braze-engine/scene-v1`. Scene decoding lives
under `src/scene/serialization/`; UI and runtime modules do not parse raw JSON.
The codec:

- accepts `unknown` input;
- validates identifiers, supported primitives, finite transforms, and component
  shapes;
- rejects duplicate object IDs and unsupported future versions with structured
  diagnostics;
- migrates supported legacy/unversioned documents deterministically;
- preserves explicit false and zero values;
- round-trips the full authored component data.

Adding persisted data requires a default in one domain-owned location, encoder
and decoder support, a round-trip test, and a backward-compatibility fixture.
Changing meaning requires a new version or explicit migration; never silently
reinterpret a v1 field.

Live commands resolve imported model AssetRefs through the Project asset API and
existing scene resolver before the history commit; Inspector availability does
not wait for a later catalog refresh. Revisions/lifetimes are rechecked after
the asynchronous asset read.

New authored objects, components, materials, tracks, and prefab instances use
UUID-backed identities so separate editor tabs cannot create the same logical
key. Legacy records that omitted an identity receive a deterministic,
document-local migration ID; decoding the same bytes twice must produce the
same result.

### Project documents

The canonical project envelope is `braze-engine/project-v1`. Project-global
libraries such as materials and asset organization live in the game project,
not in the reusable engine checkout. Browser storage is a validated offline
fallback only.

A browser recovery copy is never promoted merely because the canonical load
failed. Project-section writes remain disabled until the remote base loads.
Edits made while that load is pending are three-way merged from the recovery
base; overlapping local/remote edits become a visible conflict instead of an
overwrite.

Top-level project sections carry independent revisions. Saves merge through a
serialized server boundary, so a material save cannot erase a concurrent asset
folder save. A stale write to the same section receives a conflict rather than
silently overwriting another editor.

The client retains the loaded base value for each section and performs a
three-way merge after a revision conflict. Stable material IDs and asset-map
keys allow independent concurrent edits to merge automatically. If both
editors changed the same field, or one deleted a value the other changed, the
section becomes conflict-blocked: it is not replayed automatically, and the
top bar keeps the unsaved state visible until the user reloads and reconciles
it. Transient transport failures remain retriable from that status indicator.

### Durable writes

Document writes use this sequence:

1. Read and hash the current canonical bytes.
2. Compare the caller's expected revision.
3. Serialize the complete canonical JSON document.
4. Write a unique temporary file and `fsync` it.
5. Preserve the previous document in a bounded backup directory.
6. Atomically rename the temporary file and sync the containing directory.

Writes to the same document are queued. Scene and project conflicts return
HTTP 409 with the current revision. Scene autosaves are serialized so an older
request cannot overtake a newer request. Every full or incremental scene write,
including page-teardown keepalive saves, must provide a string-or-null base
revision; omitting the token is rejected rather than disabling concurrency.
Project writes likewise require a revision token for every authored section in
the patch; the server never treats a missing token as permission to overwrite.

Asset sidecars use the same atomic and revision-aware boundary. Their generic
envelope delegates opaque settings to a versioned importer; it never becomes a
second persistence location for scene or prefab components.

Canonical paths are under the explicitly configured game project. The standalone
engine defaults to its ignored `.braze/workspace/` directory. Launcher and server
share one project-root resolver and never select a sibling game or load project
data from the engine root. Use `BRAZE_PROJECT_ROOT` to open an existing project.
The historical Avatar Bot creation preset required an unbundled model and is no
longer offered. A new workspace starts with a camera and directional light;
the former water/ship demo is not part of editor defaults. Import character assets through the Project window. Legacy bot
fields and old prefab formats remain readable for existing project compatibility.

Project layout:

```text
game/
  braze.project.json       optional path configuration
  project.json             project-global authored libraries
  scenes/*.scene.json      independently addressable scenes
  .braze/Backups/          bounded recovery copies
  .braze/Library/          rebuildable derived data
```

The server supports listing scenes and revision-aware `GET`, `PUT`, and
incremental `PATCH` by scene ID. Incremental transport changes only modified
metadata/objects; files on disk remain complete, readable JSON documents.

## 4. Time and frame ownership

`EngineLoop` is the browser-frame authority. It provides one timestamp and one
active-time delta to ordered phases:

```text
timeline -> simulation -> render -> afterRender
```

Participants are demand-driven. Requesting work schedules one shared browser
frame; a callback explicitly requests another frame if work remains. The loop
resets delta after idle and while the document is hidden, preventing catch-up
spikes.

The application root owns one high-performance `GPUDevice`, one Three WebGPU
renderer, and one device-scoped render session. Scene, Game, interactive
previews, and serialized static previews register independently sized
`CanvasTarget` surfaces. Reflection, GPU timing, and simulation register named
device-task lanes. Every lane uses the same fair latest-wins admission queue and
bounded queue-epoch governor; no subsystem creates a competing submission
budget or hidden clock. One `EngineFrame` maps to one shared render opportunity,
even when several surfaces participate.

Browser startup generations acquire that session through one application-level
owner. A replacement generation cannot request a device until its predecessor's
`disposeAsync()` has destroyed the previous device. Page teardown and HMR abort
unpublished acquisition, and an adapter, device, or session that arrives after
abort is released instead of being mounted. A BFCache `pagehide` is suspension,
not teardown; the same generation resumes when the page is restored.

Three r184 starts its own unconditional animation loop during renderer
initialization. The pinned frame-ownership adapter stops that RAF, but retains
the other half of Three's frame contract: every new shared device frame advances
its `NodeFrame` exactly once after renderer counters reset. `Renderer.render()`
advances only a render identity, so bypassing this ownership adapter would
freeze FRAME-scoped pass nodes and TSL time. Access to that private pinned seam
is architecture-gated to the adapter and must be re-audited with a Three upgrade.

The build adapter in `scripts/lib/three-tsl-exports.mjs` maps the explicit local
TSL facade to existing named bindings in pinned Three. This allows unused frozen
namespace members to tree-shake without changing implementation or shader code.
Binding identity tests and browser/player regressions guard it. SSR retains the
ordinary external namespace; a changed upstream export shape fails the build and
requires review alongside the WebGPU-only constructor adapter.

Admission also owns the sole retirement fence for each accepted callback and
passes its promise through the callback's submission context. Physics, preview
readback, particles, reflection, and telemetry consume that shared signal rather
than creating duplicate `queue.onSubmittedWorkDone()` promises. Direct queue
fences are limited to governor ownership and asynchronous session/runtime
teardown. Once an admitted callback begins, an exception cannot prove that no
queue work was submitted. Its epoch therefore remains conservatively in flight
through the post-callback fence and retires as failed; it is never cancelled as
if recording had not started.

Physics owns a fixed-step accumulator behind the simulation boundary. It
clamps gaps, caps catch-up work, and reports discarded backlog. Solver steps are
consumed only inside an admitted session task, so rejected or coalesced work
remains retryable and render cadence does not define simulation speed.

Rules for new systems:

- do not create a private continuous `requestAnimationFrame` loop;
- register in the phase that owns the work;
- use the shared frame sample;
- expose a constant-time disabled path;
- request the next frame only while work remains.

Full-workspace tools remove the covered editor root from layout. Viewport
participants treat a host with no client rectangles as suspended, so a Scene
or Game canvas cannot keep submitting hidden GPU work behind an opaque tool.
Restoring layout triggers the viewport resize/dirty boundary and resumes it.

Resize coalescing and one-shot UI focus scheduling are not engine clocks and may
use a one-shot browser frame when they cannot participate in simulation or
render work.

## 5. Live editor-to-runtime synchronization

There are two update paths, selected by lifetime.

### Authored structural changes

Immutable authored-state references feed a pure reconciliation planner. The
planner identifies added, removed, and changed object IDs plus dependency
closures such as material users or descendants affected by hierarchy changes.
The Three adapter applies only that plan. Selection, gizmo preferences, and
other editor chrome update their own bindings and must not rebuild the world.

### High-frequency transient changes

Camera motion, gizmo preview transforms, timeline samples, and animation
playback use narrow subscriptions and runtime refs. They mark the affected
runtime dirty directly and do not copy the complete scene through React on
every display frame. Deliberate authoring boundaries—pointer release, scrub
completion, keyboard completion, pause, or Stop—commit authored state.

This split gives Scene and Game views immediate feedback while keeping the
React application shell outside the frame loop.

Scene and interactive asset previews share `createEditorGrid`, adapted from
ViStudio's thin line grid. Two `LineSegments` batches draw minor and major lines
with depth testing, no depth writes, and early transparent ordering. Major lines
occur every ten cells, including neutral lines through the origin; there are no
colored axes or grid textures. Visibility, opacity, color and ground height reuse
geometry and materials. Extent/cell changes replace and dispose only geometry;
unchanged layouts are reused. Extreme extents coarsen spacing to bound the grid
to 8,004 vertices. Disposal releases both batches and removes the group.
Main-scene values remain editor preferences; asset preview values stay preview
UI state. The shared blue-grey style uses 0.56 opacity and 0.52 minor/major
contrast. Scene defaults are one-unit cells across a 100-unit extent; previews
scale cells to the model. Extents round outward to whole cells anchored at world
origin. Customized preferences are preserved. Gizmos and preview grid controls
own the manual workflow. Grid preferences have no automation operation or public
gameplay API: this is editor chrome, excluded from game rendering and authored
scene data. Agents can inspect it through browser captures and manual controls.
Interactive and generated asset previews use the application-owned WebGPU
session. Interactive previews participate in `EngineLoop`; static previews use
one serialized hidden surface and wait for queue completion before readback.
They own only their surfaces and scene resources—not a renderer, device, WebGL
fallback, or private frame clock.

### Editor visual system

`theme.css` owns the palette, typography, field metrics and semantic accents,
adapted from `alloy-vistudio/app/studio-theme`. Roboto and Geist Mono are served
locally; their licenses live under `public/licenses/fonts`. Feature styles own
layout, with `editor-inspector-theme.css` owning card presentation and
`ui/controls.css` owning shared field and interaction states. Category colors
are tones: `ui/tones.ts` names them, the component registry maps each category
to one (`sceneComponentTone`), and `theme.css` alone maps a `.tone-<name>` class
to a color. Hierarchy glyphs, component indicators, Inspector headers and
creation menus consume `var(--tone)`; features never pick category colors.
Hierarchy object glyphs wear their group's tone (geometry mesh, camera and
water rendering, light lighting, particles effects); only empties and groups are
neutral. A prefab-instance root or imported model uses the `prefab` tone and is
drawn solid. Tone glyphs are duotone: `--glyph-wash` tints their closed shapes.
Icon scale is owned by the `--icon-size-*` roles and row height by
`--hierarchy-row-h`, which the list reads so windowing always matches paint.
Hierarchy density (`large`, the maximum, or `compact`) is a per-user preference
owned by the hierarchy feature. It only switches the `--hierarchy-*` and icon
role tokens under `[data-hierarchy-density]` in theme.css; it never touches
scene data.
An object with visibility off, and every descendant, greys out as one subtree
(name, glyph and component icons) while its own row actions stay at full
strength.
Toggled controls use the neutral `--state-on-*` tokens and list selection uses
`--selection-fill*`; accent is reserved for values such as checked or playing,
not decorative edges. Tones never alter selection, authored materials or scene
lighting. Agent acceptance exercises the visible result and matching manual workflow;
personal control feel and real-GPU measurements are recorded separately.

## 6. Undo transactions

History records authored operations, not DOM event frequency. Continuous
interactions call `beginTransaction`, publish live authored values, and call
`endTransaction` once. A slider drag, numeric scrub, gizmo drag, or held arrow
key therefore creates one undo checkpoint.

Interrupted transactions commit safely before undo/redo. A no-op or fully
reverted interaction restores the previous redo branch. Components acquire
this behavior through the narrow history interaction context; global custom
events and application-wide prop threading are not part of the contract.

## 7. GPU and imported-resource lifetime

Every asynchronous or GPU-backed resource has an owner and a release path.
Shared resources are acquired as leases:

```text
acquire(key) -> lease.value
             -> lease.release()
```

Scene/Game imported model clones share immutable source geometry, own mutable
materials, and retain source textures until subtree disposal. Material
textures release with `Material.dispose()`. HDRIs are viewport-scoped. Preview
and import operations release one-shot sources explicitly.

Idle cache budgets are enforced by least-recently-used eviction:

| Cache | Idle entries | Estimated idle bytes |
| --- | ---: | ---: |
| Imported model sources | 4 | 128 MiB |
| Material textures | 32 | 128 MiB |
| HDR environments | 1 | 192 MiB |
| Editor chrome assets | 0 | immediate release |

Active leases may exceed an idle budget because a visible scene must never
have a resource disposed underneath it. Failed entries leave lookup
immediately. If a stale asynchronous result completes, it is disposed rather
than attached. Network transfer initiated by Three's `TextureLoader` may be
unabortable, but its result still follows ownership rules.

The device-scoped session observes `GPUDevice.lost` once. Loss immediately
quiesces every lane, releases surfaces and renderer ownership, destroys the
browser-owned device, and remains visible as a structured renderer failure.
Permanent loss skips the normal final queue fence because an unusable device may
never settle it. Teardown and failure observers are contained so one throwing
cleanup cannot strand later owners or leave a rejected-frame loop alive.

Cache byte counts estimate source payloads, not backend allocation. The shared
renderer/device keeps imported geometry, pipeline, texture, and sampler caches
device-resident across Scene, Game, and preview surfaces. Public Three memory
counters are shown separately from JavaScript heap and are still estimates,
not guaranteed driver allocation totals.

Renderer construction installs the r184 nested-lighting compatibility adapter,
backporting the scope restored upstream by
[three.js#33737](https://github.com/mrdoob/three.js/pull/33737). r184 shares one
`LightsNode` per scene: nested shadow cameras on caster-only layers overwrite
the main view's light list and cached shader nodes. The adapter gives each
scene/camera pair its own `LightsNode` through the exposed lookup and creation
methods, preserving the default postprocessing lookup. Restoring only the light
array after a nested draw cannot restore compiled nodes. Weak maps follow scene
and camera lifetimes without per-object work, GPU readback or another frame clock.
Remove this adapter when upgrading to a version with the upstream lighting scope.

The viewport describes rendering at two deliberately separate levels. The
immutable logical graph records semantic dependencies, pruning, lifetimes, and
a descriptor-compatible alias plan used only for analysis. That alias plan does
not allocate or control Three resources. A pinned Three r184 execution adapter
validates the compiled pass order, resources, terminal, and feature/pass
consistency, then derives the physical branches from those passes. Both the
Three node topology and its exact physical manifest consume that execution plan;
feature flags are validation metadata, not a parallel execution authority. The
manifest records target owners, extents, attachment formats and mip counts,
execution owners, and cadence. Contract tests must change whenever the pinned
backend changes its real target topology.

The r184 CSM adapter explicitly synchronizes cascade light/target world matrices
and WebGPU shadow projections after placement and before rendering. This preserves
the ordering addressed upstream by [three.js#34213](https://github.com/mrdoob/three.js/pull/34213)
while retaining Braze's generation-driven update ownership. Cached shadow matrices
are refreshed only with dirty maps, keeping their projection and contents paired.

The full topology identity includes shadow availability for execution diagnostics.
The scene/post resource identity excludes the separately owned shadow passes:
toggling the directional light or its shadows must not dispose and recompile
unchanged cloud, godray, AO, SSR, bloom, or composite nodes. Post resource identity
still derives from the compiled execution plan and includes baked effect settings.

Disabled effects add no physical targets. AO's compiled inputs select either
depth reconstruction or SSR's scene-normal MRT; clouds are quarter-linear; the
godrays source mask and radial result are half-linear R8/R16F targets; and the
three CSM targets are persistent invalidated history, each with Three's RGBA8
color attachment plus depth. At the maximum post topology the adapter owns 18
render targets, 22 attachment textures, and at most 24 executions. Enabling all
three shadow cascades makes those totals 21, 28, and 27. At 3840×2160 the nominal
attachment texel payload is 391.49 MiB before shadows and 433.49 MiB with them;
this excludes row alignment, caches, transient backend storage, and driver
overhead and must not be presented as measured resident GPU memory.

Particles are a documented compatibility injection inside Three's base scene
pass and therefore own no independent graph target. The 128×128 RGBA16F
mipmapped reflection cube and its six invalidated capture renders are governed
by a separate device-task lane and resource lifetime, rather than being
misreported as per-viewport post-processing.

Removed renderer controls never remain in canonical authored state. Legacy
SSGI, denoise/cache, inverse-AO compensation, and Sky-owned sun-angle fields
are accepted only by an input migration. Old sky angles materialize a hierarchy
Directional Light once; normalized state and every later save omit the removed
names. With no active hierarchy light, the sky uses a fixed atmosphere-only
orientation and exposes no second direct-light authority.


## Scenes and Play

A scene owns hierarchy, objects, camera, environment, physics, timeline and
animation authoring; project libraries/assets are shared. One scene is active
per tab. Document ID survives rename; each open creates a new instance identity.
Project/Create offers Basic (camera/light/sky) and Empty (neutral/no objects).
Scene tiles open, rename, copy and delete. Copies preserve unknown extensions.

Open Single prepares/validates the target, saves the source, retires its lifetime,
publishes prepared data and hydrates to ready. Failure leaves the source usable.
Edits are blocked during transition and in Play/Prefab modes. Initial load failure
must never save defaults over the source. Saves/import callbacks match the scene
instance; stale completions cannot write into its successor. History/selection/
runtime reset; shell, dock, asset libraries, GPU session and agent connection survive.

Active scene selection is versioned tab-local session storage, not authored data.
Legacy ?scene= links are consumed once without navigation; ordinary switching
keeps the URL stable. Deletion checks saved revision and moves documents into
.braze/Trash/scenes with an identity manifest. Active deletion prepares a replacement;
the final scene gets a fresh Basic scene. Stale tabs cannot resurrect deleted data.
Restore by closing tabs on that ID and returning the archived file unchanged.
Trash is distinct from rolling backups. Runtime/additive loading remains unbuilt.

Play has edit/playing/paused states. Its owner captures authored state, creates
one world and restores authoring on Stop. Timeline play is a separate editor
preview; it must not silently enter game simulation. Every component defines
capture, pause/step and restore. The [gameplay guide](./GAMEPLAY_RUNTIME.md) owns
shared fixed-tick ordering, suspension, script lifetimes and runtime changes.

## Assets and prefabs

Project mirrors the configured physical assetsPath. AssetRef {guid, localId} is
authority; names, source paths and resolved runtime URLs are display/transport.
The source sidecar <source>.braze.meta contains fileFormatVersion, guid, importer
{id, settingsVersion, settings}, labels and optional foreignIds. It is component-
agnostic. Hashes, diagnostics, previews and derived artifacts belong in Library.
Commit source sidecars with assets; generated Library remains rebuildable.

`server/lib/assets/source-import-writer.mjs` owns publication of new source files
for agent `assets.import` and manual Project import/drop (`uploadAsset` and
`uploadAssetToFolder`). Bounded streams stage in a hidden Assets directory, obtain
a fresh GUID from the metadata owner, then publish metadata and source exclusively.
Failures clean owned staging/metadata; existing sources, sidecars and destination
symlinks cannot be overwritten. Manual root imports retain unique-name allocation;
explicit folder/path imports reject collisions so dependency URLs cannot silently
change identity. Manual uploads retain the 500 MiB limit. Agent local imports are
capped at 128 MiB and require a preview source hash on apply. Publication is per
file, not a multi-file transaction; a process crash between sidecar/source publish
can leave an orphan sidecar which blocks replacement until explicitly recovered.
Model buffers/textures must keep their relative paths. Agent import indexes and
returns diagnostics after publication; index failure reports the committed source.
Neither indexing nor a copy proves browser rendering. Source replacement/reimport
and URL fetching are not agent import operations. Scene undo does not remove imports.

Saved `prefab.create/inspect/edit` commands are owned by
`server/lib/prefab-authoring-commands.mjs` and
`src/prefabs/authoring/prefab-commands.ts`. They share the queued
`prefab-document-store.mjs` with manual Prefab Mode, including byte revisions,
backups and an in-queue GUID guard for agent and Prefab Mode writes. Prefab graphs keep their own
camel-case codec and preserve authored extensions; they never pass through scene
serialization. `automation/application/object-commands.ts` shares feature-owned
object/component mutations between scene and prefab transactions. Graph validity
and runtime-subset diagnostics are separate; dependency readiness still belongs to
runtime compilation. Saved writes do not mutate open drafts, linked scene instances
or running catalogs. Reopen Prefab Mode and restart Play to capture changes.

Importers own extensions, defaults/settings codecs, stable semantic subasset IDs,
Inspector and dependency analysis. Artifact identity includes source content,
normalized settings, importer version, dependency keys and target profile. Invalid
sidecars are preserved and diagnosed. Import failure retains the last good artifact.
Source/subasset selection opens the importer or derived read-only properties.

Apply & Reimport / Save & Reimport commits a complete draft through revisioned
atomic sidecar writes; Revert discards it. Bounded recovery drafts are GUID/base-
revision keyed, visibly unsaved and never runtime authority; canonical conflicts
block Apply. A selection generation owns async importer loads/saves, including
A→B→A selection. No inferred final gesture writes metadata.

Explicit Project selection carries a fresh focus request even for the same asset;
returning from scene selection/instantiation must restore its Inspector.

Move/rename moves source and sidecar together; GUID stays. Duplication creates a
new GUID. Reimport retains stable local IDs. External source-only rename recovers
identity only with one unambiguous orphan/source hash/importer match. Duplicate
GUIDs and ambiguous renames diagnose rather than guess. Delete audits reverse
references, uses recoverable Trash and leaves referencing objects as missing.
Restoring the original GUID heals them. Watchers invalidate; fresh scans decide.

Prefab documents use braze/prefab-v1, their own sidecars and stable node local IDs.
Instances retain prefab AssetRef, instance ID, source local ID and overrides;
reimport updates non-overridden values by identity. Component removal does not
delete referenced assets. Runtime instantiation supports a narrower subset than
the editor; see [prefabs and pools](./GAMEPLAY_RUNTIME.md#prefabs-models-and-pools).
Nested prefabs/variants remain planned, not implied by a possible reference shape.

Legacy migration resolves AssetRefs first while retaining tested URL/filename
fallbacks. Read legacy .tganprefab.json and migrated .tganimport.json settings;
write canonical Braze formats. General material/texture AssetRef conversion is
still incomplete. Do not claim all historical URL fields are already removed.
The [Unity bridge](../tools/unity/com.braze.bridge/README.md) owns interchange: it
exports selected dependency closures using Unity APIs, preserves foreign GUID
mapping, and reports unsupported components/shaders. Imported Unity source does
not imply that Unity scripts or shaders execute in Braze.

## Manual editor contract

Scene owns navigation, selection, grid, labels and handles. Game owns final active-
camera output, runtime input focus and Stats; it has no editor orbit/selection
handlers. Game focus leaves text inputs and editor shortcuts isolated. Switching
active Game camera never overwrites the independent Scene camera.

Dock controller alone owns panes, sizes, maximize/restore and layout preferences.
Drag a tab onto a strip to join, an edge to split, or workspace bottom for a full-
width row. Preview the actual destination. Maximize projects the existing group
without remounting content or rewriting the saved dock tree. Hidden/inactive
panes retain UI state but release shortcuts/render/simulation work.

Scene toolbar supplies T/R/S, Frame Selected (F), global/local space, snapping
and Gizmos. Scale/component handles stay local; collider/modifier handles remain
unsnapped. Orientation gizmo uses accessible ±X/±Y/±Z buttons and a center projection
toggle. Preserve orbit target/distance and projection scale; manual orbit cancels
snap. No extra GPU renderer or clock. Unsupported pivot/center, rect/2D, debug
shading and universal-transform controls are not advertised.

Game header owns camera, aspect/resolution, preview scale, Play status and Stats.
Free Aspect follows pane; ratios constrain preview; fixed presets set output
pixels. Low Resolution uses DPR 1 or halves fixed presets. Preview zoom does
not alter output. Custom presets cap at 8,192 per axis and 16,777,216 pixels.
Settings are editor preferences; resize live surfaces without reloading resources.
VSync is a browser capability, not a fake switch.

Shared EditorIcon and src/ui controls own glyphs, states and accessibility.
Component registry supplies labels, category tones and icon roles; Inspector
sections use SceneComponentPresentation. theme.css owns tokens, controls.css
interaction skins and inspector.css layout. Use one neutral elevation ladder;
feature CSS owns positioning, not copied colors/control geometry. Booleans use
checkboxes/toggles; optional XYZ channels keep stable rows; mixed selection and
disabled reasons are explicit. Continuous edits form one undo transaction.

Global status has selection, priority activity and metrics slots. Features publish
typed transient entries, never mutate footer DOM. Errors/conflicts outrank saves,
then dirty then Ready. Reuse shared timing/camera samples. Console and Stats
semantics and operating procedures are in [OPERATIONS.md](./OPERATIONS.md).

Scene load failures keep the current editor open. The informational error toast
does not intercept pointer input, so Project scene tiles remain available for
recovery even when the toast overlaps them.
