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
   only with agent and manual acceptance. Keep the eight owning guides synchronized.

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
