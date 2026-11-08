# Engine status and next work

This is the only current completion/evidence ledger. Product and delivery gates
are in [AI_GAME_DEVELOPER.md](./AI_GAME_DEVELOPER.md). Contracts describe semantics;
this ledger distinguishes shipped building blocks from unmet acceptance.
The public repository begins with a clean engine snapshot. Earlier private
development history is not included. Latest acceptance is recorded below; historical evidence is labeled separately.

## Priority

1. Close remaining agent authoring gaps for live prefab instances and material/import
   settings through the existing feature owners. Local source-media import, saved
   input map authoring, project selection, saved prefab graphs and embedded Animator
   authoring now share manual/agent owners.
2. Extend responsive UI with drag layout tools, virtualized inventories and runtime
   UI prefabs; build on the tested media, controller and breakpoint workflows.
3. Extend editor script creation/diagnostics and reusable gameplay capabilities
   only with agent and manual acceptance. Keep the owning guides synchronized.

The planned sequence remains runtime/lifecycle (M1), behavior/control (M2),
audio/HUD/dialogue (M3), scenes/saves (M4), visuals/cameras (M5), NPC sensing/
navigation (M6), and production scale (M7). Dependencies determine order. One game's
story or feature needs do not gate a general engine. No stage is complete merely
because one helper or one game fixture works.

## Current capability ledger

| Item | Evidence / present boundary | Disposition and acceptance |
| --- | --- | --- |
| Gameplay code | `src/gameplay`, `src/behaviors`, `scripts/lib/project-game-module.mjs` | **Project host and saved behavior module implemented.** Project entry, isolated Play lifetime, bounded events and fault diagnostics are joined by per-entity lifecycle, scoped cleanup, a typed project registry and saved Inspector attachments. See [behavior authoring](./GAMEPLAY_RUNTIME.md#behaviors-and-classes) and [manual behavior verification](./OPERATIONS.md#manual-review). Behavior graphs and arbitrary component extensions remain open. |
| Data-driven behavior | `src/automation/domain`, `src/character/runtime`; Animator owns animation only | **Open, M1/M2.** Versioned event/condition/action state machines, validated targets, instruction/event budgets, authoring commands and export. No `eval` or arbitrary code in command payloads. |
| Spawn/destroy | `src/world` owns handles and atomic structural batches; `src/gameplay/adapters` owns Play presentation; `src/three/physics/authored-body-removal.ts` removes captured bodies sparsely | **Partial, M1.** Logical/dynamic box/sphere creation and authored subtree destruction work in editor/player. Supported imported/animated models are included. Unaffected GPU state is preserved; removal cleans behaviors, tags, motors, static query membership and joint endpoints. Stop restores authored content. Arbitrary runtime meshes/materials, generic kinematic bodies, partial compound edits and growing solver capacity remain open. See [entity lifecycle](./GAMEPLAY_RUNTIME.md#entities-and-structural-changes) and [authored destruction](./GAMEPLAY_RUNTIME.md#entities-and-structural-changes). |
| Runtime prefabs/pooling/tags | `src/prefabs`, `server/lib/prefab-authoring-commands.mjs`; Prefab Mode | **Saved asset authoring implemented; runtime partial, M1/M3.** Three agent commands share manual object/component operations and the revisioned prefab store, preserving GUIDs/local IDs and drafts. Runtime subset diagnostics are separate from dependency readiness. Saved graphs instantiate/remove atomically with fresh handles and remapped parents in editor/player. Registered behaviors activate per instance and reset on pool reacquire. Saved catalogs are captured per Play and embedded in static builds. Imported models and materials are prepared before commit. Dynamic bodies retain GPU poses and reject applied root motion. Pools retain reserved slots/prepared assets; one project tag is centrally indexed. Broader components, generic kinematic bodies, external entity references, prewarming and active reset-in-place remain open. See [runtime models](./GAMEPLAY_RUNTIME.md#prefabs-models-and-pools), [entity tags](./GAMEPLAY_RUNTIME.md#tags) and [runtime prefabs](./GAMEPLAY_RUNTIME.md#prefabs-models-and-pools). |
| Input | `src/input`, `server/lib/input-map-authoring.mjs`, `server/lib/input-authoring-commands.mjs`; separate from editor navigation | **Runtime, authored assets and agent authoring implemented.** Five discoverable input operations share manual asset/project stores, GUID identity, previews, revision conflicts and backups. Versioned maps, keyboard/mouse/gamepad, focus ownership, pointer lock, session rebinding and once-per-tick edges use disk-backed [Input Action Map assets](./GAMEPLAY_RUNTIME.md#input-assets), a GUID project selection, immutable saved Play capture and static embedding. Open drafts remain intact; external changes require reopening/reloading the view. Runtime map switching/profiles and persisted player preferences remain open. |
| Human character control | `src/character-controller/domain/runtime-character.ts`, `character-locomotion.ts`, `stock-character-controls.ts`, `stock-character-control-registrations.ts`; public character port | **Static motor, runtime characters and stock policies implemented.** Saved FPS/TPS/top-down controls are available with a reusable input preset, command-pose snapshots and exclusive movement/camera leases. Orientation→motor→camera runs on one admitted tick; typed factories let project scripts compose/replace stock behavior. Dynamic obstruction/platform carry, navigation and broader component editing remain open, M2/M6. |
| Audio | No runtime audio service or timeline audio track | **Open, M3.** GUID clips/importer, positional sources/listener, buses/music/voice, gesture unlock, bounded voices, async cancellation, timeline seek/loop/Stop and exported assets. |
| Game UI/dialogue | `src/game-ui`; shared scene component, public `context.ui` and DOM adapter | **Responsive UI, media and controller navigation implemented, M3.** Saved/script-created row, column, grid and overlay screens; buttons/text/images/input/slider/toggle/progress; imported fonts, theme tokens, breakpoints, fixed-tick actions and tweens. Preview selection, sibling ordering, typed breakpoint fields, undo/save and API-free export share the same model. Opt-in standard gamepad focus is tested with simulated device input. Physical-controller feel, virtualized lists, drag layout tools, modal trapping, world-space UI, runtime UI prefabs and dialogue progression remain open. See [responsive UI](./GAMEPLAY_RUNTIME.md#responsive-game-ui). |
| Runtime scenes | `docs/ENGINE_ARCHITECTURE.md`, `src/scene/application/scene-workspace.ts` | **Open, M4.** Build scene manifest, load/prepare/commit transitions, cancellation, old-scene teardown, failed-load recovery; additive worlds have a separate identity/physics contract. |
| Gameplay saves | Existing stores save authored project documents | **Open, M4.** Versioned game state and migration, stable scene/entity references, validated atomic slot writes and restore before activation. Authoring files never serve as game saves. |
| Point/spot/area lighting | `src/scene/domain/directional-light.ts`, `src/three/hooks/use-directional-light.ts` | **Open, M5.** Point/spot first with authoring, codec, shadows, culling and bounded light cost. Area lights require a separate supported shading contract. |
| Probes / baked GI | Global environment/reflection capture under `src/rendering/adapters/three-webgpu/reflections` | **Open, M5.** Local probe identity, bake/cache invalidation, blending and budgets; evaluate baked GI against indoor content. |
| Navigation/pathfinding | No navigation owner | **Open, M6.** Versioned navigation assets, bake/import, bounded asynchronous paths and cancellation, obstacles and agent integration; disconnected/invalid targets fail explicitly. |
| AI/behavior trees/NPC/LLM | No gameplay AI host; Animator is not an NPC brain | **Open, M6.** Typed NPC intents above locomotion/perception, rate limits and cancellation; state machines first. Behavior trees and optional LLM adapters need reusable execution/provider contracts and representative fixtures. No provider credentials in a static player. |
| Dynamic sensing | `src/physics/runtime/queries/static-query-world.ts` explicitly excludes GPU motion | **Open, M6.** GPU query commands plus bounded on-demand result delivery with ticks, overflow and stale-lifetime handling; never scan CPU scene transforms for dynamic truth. |
| Camera component | `src/camera/domain`, `src/camera/adapters`, Camera Inspector | **Essential lens and output controls implemented.** Perspective/Orthographic, FOV axis/size, validated clipping, 32-layer culling and Environment/Solid Color backgrounds share tools, saved data and script lens overrides. Agent/manual/static-export acceptance passed. Physical lenses, compositing and other deferred controls are listed in the [camera contract](./GAMEPLAY_RUNTIME.md#authored-camera-and-runtime-lens). |
| Follow/virtual cameras | Runtime camera lease/snapshot/constraint ports; `src/camera/runtime/follow-camera.ts`, `stock-camera-policies.ts` | **Follow and stock camera policies implemented.** Saved FPS/TPS/top-down settings are available with clockless factories, pointer-delta/gamepad-rate look, exclusive ownership and static boom constraints. Full automated verification passed; manual acceptance remains pending. Camera blending/shake, automatic FPS model hiding and dynamic obstruction/targets remain open, M2/M5. |
| LOD/occlusion | No authored LOD or general occlusion system | **Open, M7.** Stable asset references, GPU/renderer selection, hysteresis, correct shadows and measured scenes; avoid per-body JavaScript traversal. |
| Streaming/terrain | No streaming world or terrain owner | **Open, M7** for streaming; **later engine backlog** for terrain. Explicit cell identities, async cancellation, bounded residency and seam/collision tests; terrain also needs authoring, storage, LOD and collision contracts. |
| KTX2/Draco/meshopt | No configured compressed-asset decode/cook path | **Open, M7.** GUID-preserving import artifacts, configured decoders, build dependencies and missing-decoder diagnostics; compare quality, download size and memory. |
| Anti-aliasing | `src/three/renderer.ts`, `src/rendering/adapters/browser-three-webgpu-session.ts`; MSAA disabled | **Open, M5.** Implement a supported post-process or multisample path through the shared renderer, test all passes and both exports, report cost on a real GPU. |
| Grading/motion blur | Environment types retain adjustment fields; no full-frame grading pass or velocity/history contract | **Open, M5** for grading; **later engine backlog** for motion blur. Grade once in the color pipeline; motion blur requires object/camera velocity and history invalidation, not a cosmetic toggle. |
| Physics sleeping | `docs/PHYSICS_ENGINE.md` unsupported row | **Open, M7.** GPU island sleep/wake with sparse commands, contact/constraint wake propagation and no readback. |
| Physics interpolation | Requested interpolation currently diagnoses unsupported behavior | **Open, M5/M7.** GPU previous/current poses and shared alpha, including shadows/instances; never write per-body CPU matrices. |
| Dynamic convex / motors | Primitive compounds and hinge limits exist | **Open, M7.** Validated convex import/bounds, stable contacts, motor limits/forces, both small/large schedules and numeric regression scenes. |
| Moving-platform carry | Character queries see static geometry only | **Open, M6/M7.** Define platform pose authority and attachment/detachment before carry; handle rotation, teleport, jump and platform destruction. |
| Hardware performance | Physics documentation explicitly says timings are unmeasured | **Open, M7.** Record adapter/browser, configuration and representative frame/physics percentiles. Software-browser test timings are not acceptance evidence. |
| Nested prefabs / variants | Current prefab documents and links have no nested/variant contract | **Open, M7.** Stable nested identity, cycle detection, override inheritance/rebase, missing assets and runtime compilation. |
| Shader graph | Built-in material slots and internal shader stages | **Later engine backlog.** Needs typed graph/versioning, compilation errors, material/asset integration and GPU resource ownership. |
| Static web export | `scripts/lib/player-package-compiler.mjs`, `player-package-assets.mjs` | **Implemented single-scene baseline; open, M4/M7.** Gameplay code and saved prefab dependencies compile into API-free static players. Saved input selection/maps are embedded. Multi-scene dependencies, deterministic cooking, platform manifests and content hashes remain open. Native packaging is separate. |
| Profiler | Stats/console and renderer timing instrumentation exist, no profiler workspace | **Open, M7.** Bounded sampled CPU/GPU phase traces, delayed GPU samples, resource counters, pause/export and a panel that does not add full-world readback. |
| Component/Inspector extensions | Engine-owned registries under `src/scene/presentation`; `src/behaviors` | **Partial, M1/M2.** Registered project behaviors have typed scalar/entity fields, defaults, versioned persistence, an Inspector component, runtime lifecycle and static export support. Arbitrary component families, asset fields and broader dependency contracts remain open. |
| Networking | No multiplayer contract | **Later engine backlog.** Define authority, replication, transport and security as a dedicated engine capability. Do not imply lockstep/rollback from fixed-step physics. |
| Localization | No game text catalog/runtime resolver | **Later engine backlog for content tooling.** Give future dialogue/UI stable text IDs now; locale selection, fallback, fonts, plurals and RTL require separate acceptance. |
| Stale character docs | Final paragraph of `docs/CHARACTER_SYSTEM.md` contradicted implementation | **Corrected.** Describe supported capsules/kinematics and static-only movement; preserve remaining limitations. |
| Test coverage claims | Local unit files plus `tests/browser/physics-*.spec.ts`, `src/soak` | **Open, cross-cutting.** Record behavioral coverage, fill uncovered pure policies and lifecycle boundaries; add visual/GPU tests for effects instead of treating file counts as coverage. |
| Replay/rewind | Fixed-step scheduling without cross-GPU determinism guarantee | **Explicitly unsupported.** Input recording may be diagnostic; reproducible rollback requires a separately designed snapshot/state/event contract. |
| Game-specific requirements | Projects live outside the engine source tree. | **Separate project decisions.** Game rules and content do not gate reusable engine systems. Engine acceptance uses independent fixtures and explicit capacity/platform measurements. |


## Agent and scripting work

The HTTP v1 authoring API and synchronized skill expose 43 operations.
`editor.behaviors` discovers registered fields; `editor.ui` observes ready runtime
screens. Stdio MCP exposes those operations plus capabilities as 44 typed tools.
Five input operations create/inspect/save maps and inspect/select project input
through the same feature-owned stores as manual authoring. Their schemas describe
device variants, limits and defaults; all writes preview and use saved revisions.
`assets.import` previews and imports one local model/image/font/buffer into a new
exact path with a source hash, stable AssetRef and index diagnostics. It shares
the manual upload writer; collisions preserve source bytes and identity. Source
replacement, URL fetching and atomic bundle import remain unsupported.
`prefab.create/inspect/edit` author saved graphs by GUID and source revision, with
stable local node IDs, backups, preserved drafts and separate runtime-subset
diagnostics. Public scripts reuse captured catalogs; registration remains a
project-source manifest. Nested graphs, variants and live instance overrides remain open.
Animator component commands replace embedded controllers through shared codecs,
model eligibility and scene/prefab transactions. Recursive graphs, blend trees,
parameters, events and Behavior Map layout have discoverable schemas and budgets.
Dependency readiness and runtime limitations still require Play/export assessment.
Project source hot updates are contained at the game-module boundary; current
Play instances and scene history survive, and updated modules load next Play.
Native Game input and PNG capture use an explicitly selected dedicated-browser
session. Export jobs build saved revisions into isolated output through the shared
compiler and budget gate. They do not publish or snapshot the complete project.
The CLI and MCP share transport and never replay writes; cancellation cannot undo
already-delivered actions. Host configuration can be generated without changing
host settings. Embedded chat, richer asset/material/import
authoring, live prefab instance commands and broader script-creation UX remain open.

JavaScript/TypeScript project modules run in editor/static players. The stable
local `@braze/game` entry, optional `ScriptBehavior` base, `defineBehavior` and
`defineGame` helpers are implemented over the existing lifecycle. `create:game`
generates an organized plain-JavaScript project with a playable collection game,
per-object Inspector fields, a separate score system and checked JSDoc. Existing
projects and imports remain supported. Script asset creation/Inspector UX,
broader fields/custom Inspectors, automatic discovery and gameplay behavior graphs
remain open; this is not Unity feature parity or a published SDK package.

## Recorded baseline evidence

Before this consolidation/scripting change, Step 15 automation passed:

- Architecture: zero ratcheted exceptions; TypeScript passed.
- 425 Vitest files / 1,724 tests; 198 Node tests.
- Soak: 20 files / 24 tests.
- Build: 34 chunks / 3,274,316 emitted JavaScript bytes within unchanged budgets.
- 56 runtime browser checks across 16 configurations: initial matrix, affected
  reruns and four native control variants. This was a combined result, not one
  uninterrupted runner invocation.
- Three GPU lifetime/idle/pacing regressions passed. Private-project clone Play/Stop/hover
  reproduction: 308 GPU errors → zero. Minimal negative control: 310 → zero.
  Shadow-caster shader caches now release stale pose references at cold lifetime
  boundaries, without delaying destruction indefinitely or resetting every frame.

These counts describe that baseline, not tests rerun for every future revision.
Native FPS/TPS/top-down/scripted input passed. At that baseline, manual acceptance
for animated prefabs, input assets, runtime characters and stock controls was
pending; current input acceptance is recorded below. Real-hardware frame-time/scale
targets remain unmeasured. The new agent-game
acceptance contract must not be retroactively labeled passed by these tests.

## Latest change acceptance

Mesh Renderer and asset browser, 2026-11-09, based on `91d7fd9`:

- Essential Mesh Renderer authoring supports material picking, reveal, clearing,
  drop assignment, Reset, removal, enabled/shadow/output settings and Undo. Imported
  whole-model slots are discovered from source metadata even without generated
  material assets; editing one slot preserves other effective assignments. Disabling
  the renderer affects its body, preserving children and colliders. Undo to omitted
  shadow settings restores defaults. Public scene/live/prefab edits share validation;
  live inspection exposes material IDs and resolved slot keys.
- Mesh/material picker buttons open the shared responsive asset browser. It uses
  Project toolbar controls, search, compatible type filters, Favorites/Recent, source/folder filters, name sorting, grid/list,
  preview zoom, balanced glyph/background sizing, paged results and staged selection details. Materials reuse physical
  sphere thumbnails. Mesh subassets currently use type glyphs. Rules and remaining
  renderer/runtime limitations are recorded in EDITOR_DESIGN and GAMEPLAY_RUNTIME.
- Fresh independent public acceptance used the retained isolated project
  `/private/tmp/braze-mesh-filter-acceptance-20261109`, including two mesh consumers,
  an independent child and a two-material whole model. It exercised strict rejection,
  settings/material transactions, discovery, independent slots, clear, Undo/Redo,
  save and prefab paths. Embedded manual review verified child visibility, material
  browser search/zoom/list/cancellation and a matching API-free static export.
  Play/Pause/Step/Stop/restart preserved authored objects. Pausing before the first
  physics step left collider-backed visuals unpublished until Step; this existing
  initialization limitation is not a renderer parity claim.
- Evidence: `renderer-acceptance/receipt.json` in the isolated project,
  `/private/tmp/braze-asset-browser-final.png`, `/private/tmp/braze-renderer-play.png`,
  `/private/tmp/braze-renderer-player.png`. Independent screenshot review passed the
  wide responsive modal; browser checks also cover 1000px and 1800px windows.
- Verification: 449 Vitest files / 1,798 tests, 238 Node tests, 20 soak files /
  24 tests, 12 relevant browser checks, types, docs, architecture with zero exceptions
  and the production bundle budget (39 chunks / 3,275,418 JavaScript bytes). Shared
  Favorites/Recent synchronization and the 24-item retention limit passed browser
  assertions and independent source review. No release/deployment or main-project mutation.


Hierarchy icon spacing and object picker, 2026-11-09:

- Component badges and action buttons now share slot widths and glyph sizes,
  with zero extra gap at their boundary. Both row densities preserve uniform
  icon-center spacing. Object pickers use a smaller ring with a filled center dot,
  preserving the existing click area. Rules are recorded in EDITOR_DESIGN.
- Fresh independent acceptance used public discovery/read-only inspection of the
  existing editor and assessed `/private/tmp/braze-icon-spacing.png`. Embedded
  measurement confirmed five 14px glyphs at uniform 22px intervals. The user's
  scene remains untouched and the embedded editor stays open.
- Five affected browser checks passed, including both hierarchy densities and
  mesh-picker keyboard/save behavior. Full validation passed: 448 Vitest files /
  1,796 tests, 238 Node tests, types, docs, architecture with zero exceptions,
  and the production build (37 chunks / 3,264,722 JavaScript bytes). This changes presentation only; gameplay,
  resource-lifetime, soak and static-export checks are not applicable.


Mesh Filter parity, 2026-11-09, based on `91d7fd9`:

- Editable Mesh reference with Cube/Sphere/Plane, None and exact imported static
  mesh subassets. Search picker, keyboard clear/selection, Project drag/reveal,
  Reset/Remove, undo and saved identity share the same assignment operation.
  Field, picker and Project mesh badges use the requested grid-style glyph.
  Shared spacing and reference-picker rules are in EDITOR_DESIGN.
- GUID/local-ID source identity persists in scenes and prefabs; importer bindings
  remain derived. Missing references retain identity and recover with the source.
  Assignment preserves other components. Source-node transforms and source
  animations are excluded; immutable geometry leases and per-consumer materials
  prevent shared-object mutation. Collider helpers remain separate from render
  bodies during async replacement, material application and clearing.
- Fresh-agent public tooling built two consumers from one two-mesh glTF. It
  verified exact subasset assignment, sharing, None, unrelated-field preservation,
  preview no-write behavior, invalid-batch atomicity, missing/recovery, prefab
  serialization and explicit unsupported runtime-prefab diagnostics. Embedded
  review verified rendered exact geometry, non-null material preservation,
  clear/undo, Project reveal and Save/reload. Independent agent reviewed screenshots.
  Receipt: `/private/tmp/braze-mesh-filter-acceptance-20261109/acceptance/receipt.json`.
- API-free static export passed topology/budgets and rendered one pyramid plus
  one block with distinct colors, with one shared copied source and no API requests.
  Browser regressions cover built-in picker search/keyboard/focus at 1800px/1000px,
  undo/redo/reset/clear, real imported Project drag/reveal and save/reload identity.
  Missing/recovery was tested through public tools and unit tests, not manually.
- Scope is authored static geometry, including saved prefab instances and player
  export. Empty Transform addition, skinned mesh replacement, procedural/live
  JavaScript mesh changes and runtime-spawned mesh-subasset prefabs remain open.
  Play/Pause/Step/Stop transport was not separately exercised for this change.
- Verification: 448 Vitest files / 1,796 tests, 238 Node tests, 20 soak files /
  24 tests, 10 affected browser cases, types, docs and architecture with zero
  exceptions. Production build: 37 chunks / 3,264,603 JavaScript bytes within
  unchanged budgets. The user’s embedded editor remains open on 5179.


Editor identity, field geometry and hierarchy spacing, 2026-11-09, based on `91d7fd9`:

- Object headers use 16px type and 14px lock glyphs with 22px slots. Equal-width
  Tag/Layer fields align with the name input's edges. Hierarchy actions remain
  visible at rest; optional camera actions precede Solo/Visibility/Lock. Each
  row sizes its icon groups to content, removing hidden slots and internal holes.
- Native single-value dropdowns reuse the shared disclosure glyph with an 8px
  right inset and native menus/keyboard behavior. Numeric fields share an
  optical inset that centers digit ink while retaining the full input hit area.
- [EDITOR_DESIGN.md](./EDITOR_DESIGN.md) is the mandatory design guide, linked
  from AGENTS and README. It owns the existing surface/Inspector rules plus
  identity, action visibility, icon spacing, dropdown and numeric alignment.
  The documentation catalog enforces the guide; old rulebook anchors route to it.
- A fresh agent reused the public-tool-authored two-camera/physics fixture.
  Embedded review checked 554px and 324px Inspectors, Perspective/Orthographic,
  mesh and disabled Rigidbody fields, native keyboard selection and Save/reopen.
  All four saved and reopened live object documents match the baseline. Receipt and public-tool
  observations: `/tmp/braze-inspector-layout-agent-cyuNbc/identity-acceptance/`.
  The user's editor remains open on 5179/25179. This presentation-only change
  adds no runtime lifetime, saved schema or gameplay behavior; soak/static-export
  acceptance does not apply.
- Verification passed: 446 Vitest files / 1,786 tests, 238 Node tests and 13
  affected browser checks. Geometry/pixel checks cover both hierarchy densities,
  no action holes, shared columns, focused dropdowns and signed/decimal numbers.
  Types, docs and architecture passed with zero architecture exceptions.
  Production build passed, 36 chunks / 3,253,654 JavaScript bytes within
  unchanged budgets.

Inspector layout and selection menus, 2026-11-09, based on `91d7fd9`:

- Shared property selectors cap at 180px and shrink with the value column.
  Rows use 26px minimum height with 22px fields and 2px vertical padding.
  Body actions share an 8px gap, padding and a quiet separating hairline;
  the camera-specific hierarchy stylesheet override is removed.
- Camera layer choices use the shared, anchored `InspectorMenuSelect` overlay
  with centered chevrons and checkmarked choices. Opening never changes row
  flow; the viewport-clamped menu scrolls internally and supports keyboard,
  outside-click and anchor-scroll/resize dismissal. A queued scroll-into-view
  event cannot dismiss a freshly opened menu unless its anchor actually moves.
- [Mandatory design rules](./CODING_RULEBOOK.md#inspector-layout-and-popup-design-mandatory)
  cover all component/asset/behavior Inspectors and distinguish native enum
  selects from custom menus. Architecture documents the CSS/component owners.
- A fresh agent authored two camera configurations and a physics-equipped cube
  through public tools. Embedded review checked 674px and 324px Inspectors,
  camera and Mesh Renderer/Rigidbody/Collider layouts, keyboard focus, layer
  change/undo and reload. Receipt: `/tmp/braze-inspector-layout-agent-cyuNbc/receipt.json`.
  The first immediate reload after Undo reopened the previous mask; the cause
  was not isolated. Repeating with an explicit completed Save preserved all
  four fixture documents exactly. No uninterrupted-autosave claim is made.
  This editor-only repair changes no saved schema or runtime resource lifetime;
  standalone export, gameplay/physics validation and soak are not applicable.
- Verification passed: 446 Vitest files / 1,786 tests, 238 Node tests, 11 distinct
  affected browser checks, types, docs and architecture with zero exceptions.
  Build passed unchanged budgets at 36 chunks / 3,253,341 JavaScript bytes.

Camera gizmo correction, 2026-11-08, based on `91d7fd9`:

- Scene cameras now use a fixed 28-pixel, screen-facing glyph instead of an
  opaque camera housing. Their glyph and frustum hide at their own viewpoint,
  restore after navigation and follow Camera guides visibility. Picking matches
  the glyph's overlay order and ignores hidden chrome. Owned textures/materials
  dispose without releasing Three's shared sprite geometry.
- Look through uses the same viewfinder glyph in Hierarchy and Inspector,
  distinct from the visibility eye. Authored lens and camera transforms are unchanged.
- An independent agent authored and reloaded two cameras through public tools
  and exported the isolated scene. Embedded manual review verified both Look
  through positions, restored glyph selection, Game Play/Stop and an API-free
  static player. Receipt: `/tmp/braze-camera-glyph-agent-20261108/acceptance/receipt.json`.
- Full verification passed: 446 Vitest files / 1,786 tests, 238 Node tests,
  24 soak tests, types, docs and architecture (zero exceptions). Production
  remains within unchanged budgets at 36 chunks / 3,250,634 JavaScript bytes.
  Both camera browser checks passed, including glyph picking over geometry,
  Camera guides visibility, Look through reload and unobstructed Game pixels.
  Source HMR briefly invalidated the character asset provider; clean reload
  recovered. This pass does not establish uninterrupted source-HMR lifetime.

Camera essentials, 2026-11-08, based on `91d7fd9`:

- Camera Inspector, saved scene/prefab codecs, object authoring tools and the
  public camera lease share validated lens settings. Native Perspective and
  Orthographic output, vertical/horizontal FOV, size, clipping, all 32 object
  layers and Environment/Solid Color backgrounds are implemented. Scene
  navigation remains independent. See [camera contract](./GAMEPLAY_RUNTIME.md#authored-camera-and-runtime-lens).
- Layer filtering preserves authored child independence, physics batches,
  spawned primitives/models, cloners and particles. Mask edits update registered
  render groups; no per-body frame traversal or physics readback was added.
- A fresh agent authored two isolated camera configurations and reusable
  JavaScript through public tools, typechecked them and exported both. Embedded
  browser review verified depth-independent orthographic sizes, perspective
  depth scaling, scripted zoom, masks zero/31, release and Stop restoration,
  manual size edit/undo/save/reload, clean restart and no runtime warnings/errors.
  Public inspection confirmed Pause/Step advanced exactly one tick (378 to 379).
  Both static players ran without editor API requests. The public browser-input
  tool supports its dedicated browser only; embedded input used computer tools.
- Receipt and fixtures are retained at
  `/tmp/braze-camera-acceptance-20261108/acceptance-receipt.json`. This is functional
  acceptance, not a real-hardware performance or control-feel measurement.
- Tests: 446 Vitest files / 1,784 tests, 238 Node tests and 24 soak tests passed.
  Camera pixels, undo/reload/Play, Scene grid, sky, physics pose lifetime and
  Inspector browser checks passed (11 distinct affected browser checks). The
  final build passed unchanged budgets at 36 chunks / 3,247,739 JavaScript bytes. The
  particle editor's existing stylesheet now uses the CSS build pipeline instead
  of an unminified JavaScript string; persistence imports its data-only entry.
- Source hot reload during development briefly reported a duplicate physics
  admission registration. A full reload recovered; final editor/player checks
  were clean. This pass does not establish uninterrupted source-HMR lifetime.
- Physical lenses, camera stacking/output textures, runtime projection switching,
  blending, occlusion culling and rendered DOF remain outside this pass.

Editor session consolidation and audit, 2026-11-08, based on `91d7fd9`:

- Work remains in the canonical `/Volumes/Workflow/2027-games/braze-engine`
  checkout on its existing branch. All session changes remain uncommitted. Do not
  reset or replace them. The 5179 editor serves `.braze/workspace`; preserve its
  authored content. Use `./start.sh --status` before starting another server.
- Current visual contract is in [architecture](./ENGINE_ARCHITECTURE.md#editor-visual-system).
  `editor-design.css` owns import order; `theme.css` owns 5px corner radii, muted
  surfaces, soft borders, glyph roles and status typography. Shared controls and
  toolbar styles own interaction states. Project uses a single toolbar with
  Create, view toggles, Search, 18px filters and a right-aligned slider. View glyphs
  are 16px; Hierarchy toolbar glyphs are 18px. Icon strips have immediate tooltips,
  6px gaps and subtle separators. Legacy text-filter padding is removed.
- Tags and Layers is an Inspector target, not a modal. Enter/blur saves tag names;
  Escape cancels. Names are case-sensitive identifiers; unused definitions alone
  can be renamed. Validation blocks duplicates, invalid/reserved names and usage
  conflicts. Usage follows current objects and rescans saved scenes/prefabs after
  save/delete events, focus and periodic checks. Catalog actions are mutually
  exclusive during async scans/writes; removal rechecks current objects after
  the scan. Tag/layer writes also guard synchronous duplicate requests.
- Layers have 32 stable slots with Default at 0. Serialized assignments and runtime
  creation/pooling retain layer identity; physics inherits object layer unless
  explicitly overridden. At this baseline, camera culling, runtime setLayer, sorting/rendering layers,
  assigned-tag migration, script reference rewriting and dedicated catalog
  automation remain unsupported. Other tabs' unsaved edits are outside tag audits.
- Removed unused legacy Project toolbar CSS and consolidated superseded modal,
  filter and typography progress notes into this current state. Compatibility
  decoding and vendor fallbacks are intentional and were retained.
- Verification: TypeScript including unused-symbol checks, documentation links,
  architecture (zero exceptions), and `git diff --check` passed. `npm test` passed
  442 Vitest files / 1,773 tests plus 238 Node tests. Soak passed 20 files / 24 tests.
  Production build passed unchanged budgets: 36 chunks / 3,275,118 JavaScript bytes.
  All 102 main browser checks passed across the full sweep and affected-suite
  reruns, not one uninterrupted green run. Four stale editor assertions were
  updated for the current theme and editable object-name header. Two sky fixtures
  now explicitly author their sun direction and clear-atmosphere conditions;
  their original pixel thresholds and reopen check remain intact. The delayed
  tag-usage scan regression confirms conflicting catalog actions stay disabled.
- Audit scope: repository-wide TypeScript unused-symbol analysis, architecture/docs
  checks, source-pattern scan and regression suites, with focused manual review of
  changed persistence, tag/layer and UI ownership code. This is not an exhaustive
  security audit or proof that every possible defect is absent. Fresh gameplay
  authoring/export is unverified for this cleanup; earlier acceptance is below.

Independent Unity comparison, compact editor theme and hierarchy, 2026-11-08, based on `91d7fd9`:

- A single `editor-design.css` entry orders the editor cascade. `theme.css` owns
  the muted palette, surface hierarchy, Inspector density, field metrics,
  glyph roles and brighter selected-tab grey. Competing Inspector chrome was
  removed. Wide vectors fit on one line; narrow containers reflow label and XYZ.
- React and embedded particle controls share semantic Lucide geometry through
  `ui/icons.ts`. Font-dependent close, reorder, disclosure, favorite and status
  marks were replaced. Icon controls retain accessible names and hit areas.
  Architecture checks prevent independent imports and literal glyph metrics.
- Inspected the running Unity Project window and main Scene/Inspector workspace
  as visual references. Braze now separates dark chrome, lighter panel content,
  section headers and recessed fields, with 28px dock tabs and 22px hierarchy rows.
  This is visual refinement, not a claim of Unity feature or usability parity.
- Project and Hierarchy controls share a 24px outer height through the central
  toolbar tokens and `ui/toolbar.css`, including segmented and zoom groups.
  Hierarchy create/search remains above the collapsible scene; scene and object
  rows share regular/compact density. Neutral glyphs, clearer scene indentation
  and removed row separators follow the observed Unity hierarchy structure.
- Independent reviewer inspected Unity Camera, Light, component menu and workspace
  directly, then compared live Braze captures. This pass flattens full-width
  sections, consolidates Camera settings, shares editable identity rows and
  component menus, and fixes checkbox/disclosure keyboard interference. Rename
  commits as one undo entry. Physics enable/remove controls use the shared header.
  Hierarchy actions now occupy the rightmost column; transport padding is equal.
  Unity mesh/physics/particle inspectors were unavailable in the open scene.
  The final pass adds a neutral Scene-only background, theme-driven camera
  helper colors and a distance-faded grid. Game backgrounds remain authored.
  New default dock proportions reduce Hierarchy width without resetting saved
  layouts. A 288px Inspector check exposed header shrinking under long component
  lists; identity rows now retain their height, with a browser regression.
- Tag and Layer dropdowns open shared project settings. Layers use 32 stable
  slots, default 0, and retain assignments through scene/prefab serialization,
  instance overrides, public object commands, runtime creation and pool reuse.
  Missing collider layer overrides inherit the owning object layer; explicit
  layer 0 and masks remain intact. Camera culling, runtime setLayer and dedicated
  catalog automation remain gaps. The existing Unity scene did not supply native
  mesh, physics or particle inspectors, so those comparisons use shared patterns.
- Verification passed: docs, architecture (zero exceptions), TypeScript,
  440 Vitest files / 1,770 tests, 238 Node tests and 24 soak tests and production budgets
  (36 chunks, approximately 3.27 MB JavaScript). All 15 relevant browser checks passed,
  covering glyph metrics, selected-tab contrast/switching, docking, hierarchy
  density/persistence, Project menus, material arrays, field focus/drag and physics
  authoring, equal toolbar heights/centers and search/create access after scene
  collapse. Old 22px glyph expectations were updated to the intended 16px role.
- A fresh-context agent audited the initial Inspector/theme ownership. The author
  then performed the embedded-browser acceptance pass in an isolated project,
  using discovered HTTP v1 tools to preview/apply a cube with Rigidbody and Collider.
  Manual editing, keyboard focus, collapse/reset, undo/redo, save/reload, wide and
  narrow layouts passed. The final 311px Inspector had no horizontal overflow.
  Particle controls used the shared 14px glyphs and 1.75-unit strokes; mute/unmute
  changed their icon state correctly. The embedded review reported no console
  warnings or errors. Receipt, commands and captures are in the OS temporary
  project `braze-inspector-acceptance-m4P92G`.
- Recorded gap: `editor.edit` rejected creation of a `particle` primitive; the
  existing Hierarchy Add menu supplied the particle fixture. No tool support is
  claimed for that manual step. The dependency change required restarting the
  development servers to refresh optimized modules. The user's saved project was
  preserved and the 5179 server remains running; isolated/automated servers were
  stopped. Public layer preview/apply assigned slot 8 to the isolated cube;
  manual naming, assignment undo, save/reload and Play/Pause/Step/Stop passed.
  Live physics reported one active body and completed GPU steps. Independent
  tests verify layer 31 masks, explicit overrides and two pooled placements;
  this does not establish a rendered collision-filter matrix. No new playable
  game or static export was built for this editor pass. Human control feel and
  hardware performance were not measured. Full Unity feature parity is not claimed.

### Previous documentation change

README editor screenshot, 2026-10-21, based on `e6807a1`:

- Added the user-supplied editor capture below the repository introduction, with
  descriptive alt text and a link to the original-resolution image. The 329 KB
  PNG is stored under `docs/images` and remains outside runtime bundles.
- Acceptance is documentation presentation and image-link verification. No
  engine behavior changed, so gameplay, public-tool authoring and export
  acceptance are not applicable to this documentation-only change.
- Inspected the supplied image, verified its copied bytes and relative README
  target. Docs, architecture, TypeScript, all unit/Node tests and production
  build budgets passed.

### Previous engine change

Neutral ViStudio-style editor grid, 2026-10-21, based on `451f2bc`:

- Replaced the textured plane with two thin line batches shared by Scene and
  asset previews. Major lines remain ten cells apart; origin lines use the same
  grey as the grid, without red/blue axes. Existing controls and preferences
  remain intact. Geometry changes are bounded and disposed; styling reuses GPU
  resources and adds no frame-loop work.
- Checks passed: docs, architecture, TypeScript, 436 Vitest files / 1,760 tests,
  236 Node tests, 20 soak files / 24 tests, and production bundle budgets
  (36 chunks, 3,264,557 JavaScript bytes). Seven relevant browser checks passed
  across the initial run and focused rerun, covering grid controls/reload,
  model Inspector previews/imports, and live authoring/Play lifetimes. The new
  pixel check initially counted the viewport border; excluding that border
  corrected the test without changing rendering.
- A separate same-agent acceptance pass used the repository skill and all
  authoring through discovered HTTP v1 tools (43 operations). It created two
  differently sized blocks, a camera and light in an isolated project, previewed
  and applied a revision-guarded batch, exercised undo/redo, camera viewpoints,
  manual Gizmos controls, save/reload and Play/Stop with no browser errors.
  The first fixture omitted a game camera and Play supplied one; the repeated
  pass authored an explicit camera so object-count expectations were stable.
- Viewed the near/far Scene, model preview, and reloaded block-study captures.
  Lines are thin and neutral, major/minor contrast is visible, and opaque blocks
  occlude the ground grid. Browser captures are under `test-results`; the
  independent receipt and images are under the temporary project
  `braze-grid-acceptance-j1r9d4/acceptance` in the OS temp directory.
- Limits: no separate evaluation agent or hardware performance measurement.
  Editor grid preferences have no public gameplay API or automation command;
  manual controls and browser inspection are the supported path. Gameplay input
  and static export are not applicable to this editor-chrome visual repair.
  Automated servers were stopped; the user's 5179 review server remains running.

### Historical public snapshot

Standalone open-source extraction, 2026-10-21:

- The engine is the repository root. Launch and server paths share an explicit
  project-root resolver; the default is ignored `.braze/workspace`. An adjacent
  game or engine-root legacy project is never selected implicitly. Fresh editor
  inspection confirmed two objects (camera and directional light) and no assets.
- Private game content, backups and history are excluded. The Avatar Bot menu
  that depended on an unbundled model is removed; existing document compatibility
  remains. Compound-model tests generate an original animated FBX instead of
  reading a private game asset. The Unity bridge documentation uses generic paths.
- MIT licensing, original-asset provenance, retained font notices, contributor
  and security guidance, and source/build CI are included. Compatible dependency
  updates resolved the audit findings; npm audit reports zero known advisories.
  Gitleaks found no secrets in the publishable snapshot.
- Checks: docs, architecture, TypeScript, 436 Vitest files / 1,758 tests,
  236 Node tests, 20 soak files / 24 tests, and production bundle budget passed.
  The affected asset-database tests were rerun after the final fixture change.
- All 16 selected browser checks passed, covering hierarchy, model import/preview/rig/clip editing,
  scene persistence/recovery, and the JavaScript starter in editor and static
  player. A noninteractive load-error toast could cover a Project tile; it now
  lets pointer input through, preserving the existing recovery workflow.
- A separate same-agent public-tool pass discovered all 43 operations, scaffolded
  an isolated external project, discovered its collectible behavior, previewed
  and applied a three-point variant, saved it, entered running Play, restored
  Edit Mode and successfully built a revision-guarded export. No engine-internal
  authoring was used. Native input for that dedicated-browser pass was blocked
  because its Game view was hidden, so that variant is not claimed playable.
- The independent scripting browser checks exercised one-point and two-point
  variants, manual Inspector editing, undo/redo, save/reload, native collection,
  Stop/replay and API-free static playback without console errors. The resulting
  editor/player captures were visually inspected: the collected cube disappears,
  two cubes remain and the score/HUD reflects the selected variant. This is
  automated manual-workflow coverage, not a human control-feel assessment.
- The first Linux/Node 22 CI run exposed an existing scaffolder failure: exclusive
  directory copy rejected the precreated Scripts folder. The template now creates
  that folder itself. Both existing project-creation tests pass on Node 22,
  including refusal to overwrite and canonical symlinked paths. CI actions use
  the supported Node 24 runtime; the project checks still target Node 22.
- Remaining limits: no separate acceptance agent, no human playtest or hardware
  performance measurement, and no complete cross-platform validation. Existing
  capability gaps in this ledger remain open.

## Historical change acceptance

Project hot reload, Animator authoring and browser launcher repair, 2026-10-06,
`4547123` plus this working tree:

- Project entry/nested-source updates stop at the Vite project-module boundary.
  Current Play instances continue; subsequent Play/definition discovery sees new
  code. Unsaved scene state, revision, undo and providers survive. A browser
  regression reproduced the provider failure before the fix, then passed.
- Existing component commands now author embedded Animator documents in saved
  scenes, live scenes and prefab assets. Typed recursive schemas, bounded shape
  checks and shared feature codecs validate parameters, motions, transitions,
  graph references and layout before atomic writes. Manual Inspector/Behavior Map
  and public `context.animation` remain the corresponding authoring/runtime paths.
  Canonical prefab inspection preserves encoded extensions. Discovery remains
  43 operations / 44 MCP tools, including capabilities.
- Acceptance exposed unclear Behavior Map node IDs, delayed live model resolution
  and scaffold paths resolving incorrectly through macOS `/tmp` symlinks. Schema
  descriptions, same-commit asset resolution and canonical scaffold paths repair
  those failures. Fresh discovery/live authoring and a new unchanged scaffold passed.
- Visible and automated browser launchers no longer force unsafe WebGPU support.
  Flag-free gameplay uses native Apple Metal; the owned visible browser was
  restarted to apply process flags. User editor ownership was preserved.
- Required checks passed: docs, architecture (zero ratcheted exceptions), TypeScript,
  436 Vitest files / 1,758 tests, 235 Node tests, soak 20 files / 24 tests. Production
  build: 36 chunks / 3,265,298 emitted JavaScript bytes within unchanged budgets.
  Flag-free browser checks passed: seven MCP, two scripting and three animated
  prefab/runtime cases. The full runtime browser matrix was not rerun.
  Repository/installed skills match and skill validation passed.

A fresh agent followed the skill and built **Column Duet** in an isolated
JavaScript project using HTTP v1 discovery/commands, public `@braze/game` and manual
editor controls. One controller and registered behavior drive a scene model at
0.8× and a runtime-instantiated saved prefab at 1.6×. Native A/L keys and HUD
buttons independently toggle motion/held poses; both reaching six produces the
joint completion condition. The evaluator made no engine edits.

Manual acceptance changed an Animator Rate override and Behavior Map state name,
undid/redid, saved and reloaded. Prefab Mode override 1→1.1 passed Undo/Redo/Save
and public inspection. Missing clip references produced a specific diagnostic;
restoring the discovered reference recovered both actors. Pixel crops proved
visible motion, stationary held/paused poses and changed poses after one Step.
Stop removed runtime prefab/UI and restored authored content; restart reset progress.

Nested-module and entry-source edits during Play retained old running versions,
with no navigation/page errors. The dirty scene revision and unsaved rename
survived; Undo/Redo still worked. Next Play loaded both new versions at zero
progress. The durable regression also checks an entry edit in Edit Mode.

The evaluator exported and completed wide/narrow static runs. Independent parent
replay served the immutable final export in fresh Chromium 148.0.7778.96 pages at
1280×800 and 390×844, using keyboard wide and buttons narrow. Both completed at
6/6, held one actor while the other advanced, reset and reloaded cleanly. Native
adapter: `apple`, `metal-3`, fallback false. Both runs had zero console/page errors,
failed requests/responses, editor API calls or horizontal overflow. Viewed images
show both animated models above the HUD and readable controls at both sizes.

Acceptance required a documented manual Generic rig import setting. The initial
scaffold needed a temporary config repair before the engine fix; a fresh scaffold
then typechecked unchanged. Final visual review found phone camera clipping and
stale win text after Reset; the evaluator repaired game camera/layout and progress
logic, re-exported, then repeated completion/reset checks. No human intervention
was needed. These retries are recorded rather than treated as first-pass success.

Project: `/tmp/braze-animator-agent-acceptance-20261006`; receipt and artifacts are
under `acceptance/`. `receipt.json` records criteria, commands and manual workflows;
`commands.jsonl`, `hmr-observations.json`, `play-observations.json` and pixel evidence
retain observations. `dist-player` is the retained export; final export job is
`c691d529-3138-459e-8a99-582034cdec96`, saved scene revision
`73be1fc7a59e8686f9bccf0a2ad999077259261b02454c9ec88ccebc000c7c45`.
Independent evidence: `parent-review.json`, `parent-replay.mjs` and `parent-*.png`.
Check logs: `/tmp/braze-next-*.log`. Durable coverage includes
`tests/mcp/animator-authoring.spec.ts`, `tests/mcp/project-hot-reload.spec.ts`,
Animator authoring and scaffold/module tests. Owned acceptance and automated
servers/browsers are closed; the user editor remains on 5179/25179 with its project.

Remaining boundaries: import/rig settings require manual Inspector authoring;
broader material commands, live prefab overrides, nested prefabs and variants
remain open. Runtime prefab registration uses a project-source manifest, with no
tool/UI yet; runtime UI Canvas prefabs remain unsupported. Human control feel,
physical controllers and hardware performance are unmeasured. This text/native-
control brief uses the system font; external UI image/font dependencies and
controller navigation were not applicable.
