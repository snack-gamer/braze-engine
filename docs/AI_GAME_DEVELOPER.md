# AI game development contract

Status: mandatory product and acceptance contract for subsequent development.
Product direction: 2026-10-05. [STATUS.md](./STATUS.md) owns implementation and
verification status. Requirements below do not imply shipped features.

## Product commitment

Braze primarily serves people who ask an AI agent to build games. The planning
assumption is 90% agent-led and 10% direct manual use, as specified by the user;
this is a product priority, not measured usage. Agents must discover, author,
script, inspect, playtest, repair and export games through supported public tools.
Expert users must perform corresponding work through the editor and JavaScript.

Reusable systems are built once, configured and extended across many games.
FPS, TPS and top-down controls are examples, not an exhaustive style list. Individual games
are consumers of the engine. Unity supplies familiar workflow expectations: scenes, objects,
components, prefabs, Inspectors, scripts and Play/Edit lifetimes. Claim Braze
capabilities on their own evidence; do not imply Unity feature parity.

## One capability, three consumers

| Consumer | Required access |
| --- | --- |
| AI agent | Discoverable versioned tools; typed schemas, defaults, units, prerequisites, limits, errors and result inspection. |
| Manual author | Appropriate creation menu/Inspector/workspace, save/load, undo/redo, missing-data recovery and understandable diagnostics. |
| Project script | Public JavaScript API with types/JSDoc, explicit lifecycle and export; stock systems stay configurable and replaceable. |

All paths invoke the same feature-owned operations, validators and runtime ports.
MCP and future chat are adapters, never second implementations. Internal services
need no artificial Inspector, but their user-visible effects must be diagnosable.
Record any deliberately unavailable path, its reason and its acceptance task.

## Required agent acceptance

**Every subsequent development change includes an AI-agent acceptance assessment.**
Feature delivery requires an agent to build or modify a small game or reusable
system using the shipped skill, tools and public scripting API. Passing unit or
browser tests alone does not establish this capability.

Before implementing, define a user brief with observable success criteria. Use an
isolated project. Give the evaluating agent the brief, repository skill, public
docs, available assets and tools; withhold hidden hooks and prebuilt answers.
Use a fresh agent context when available and permitted; otherwise disclose a
separate authoring pass by the same agent. Unavailable evaluation stays unverified.

1. Discover actual capabilities and inspect the starting project.
2. Build the playable outcome/system with public tools and project scripts.
   Save through the proper authoring owners.
3. Play with representative input; inspect rendered output, gameplay state and
   diagnostics. A successful command or serialized component is insufficient.
4. Exercise changed lifetimes: reload, undo/redo, Pause/Step/Stop, reuse, missing
   dependencies and recovery as applicable. Reusable systems need a second
   configuration or consumer. Playable milestones need an API-free static export.
5. Assess the actual artifacts independently of the agent's completion claim.
   Reopen the project and compare observations with the brief.
6. Record missing tools, ambiguous schemas, undocumented steps, retries and
   manual intervention. Repair the responsible feature and repeat affected work.
   Editing engine internals during evaluation invalidates the tool-coverage claim
   and starts a new implementation iteration.
7. Exercise the corresponding manual editor/script workflow. UI automation can
   verify function; human control feel and real-GPU performance remain separate
   when personal judgment or hardware measurement is necessary.

Use the smallest representative existing game task for a narrow repair. For
changed docs/tooling, have the agent follow the instructions to perform a real
relevant task; a spelling correction does not require creating a game. Explain
non-applicable checks rather than marking them passed. A content request does
not automatically authorize engine development; report gaps and supported options.

UI acceptance includes image/font dependencies, narrow/wide layouts, keyboard and
controller focus where enabled, and the matching preview/Inspector workflow.
Use `GAMEPLAY_RUNTIME.md` for AssetRef/export and navigation contracts. Native
playtest tools do not emulate physical controllers; report simulated Gamepad
samples separately from hardware validation.

## Acceptance briefs and receipts

| Brief to the evaluating agent | Assess |
| --- | --- |
| Build a TPS obstacle course and a top-down version using the same systems. | Grounded jump/collision, camera, focus, reuse, saved configuration and static export. |
| Write a reusable countdown JavaScript class and attach two differently configured instances. | Independent state, Inspector fields, stable type IDs, enable/disable and Stop/restart without engine edits. |
| Build a spawner that pools animated characters. | Atomic receipts, capacity errors, fresh reacquire, animation, cleanup and unchanged neighbors. |
| Make an input-driven animated object with custom behavior. | Public input/Animator commands, typed fields, visible transitions, missing references and export. |
| Edit an object through tools and then the Inspector. | Matching semantics, undo/redo, revision conflicts and preservation of unsaved work. |

Record a compact receipt in the change/PR: brief, revision, skill/tool versions,
fixture/artifact paths, commands, observations, pass/fail/unverified per criterion,
manual intervention, gaps and next action. Update only the latest summary in
[STATUS.md](./STATUS.md). Keep reproducible fixtures under tests and bulky logs,
images and traces as artifacts. Do not add milestone Markdown reports.

## Current command protocol

The [repository skill](../skills/braze-game-developer/SKILL.md), local JSON CLI and
stdio MCP adapter are implemented. Embedded chat remains separate work. MCP
exposes `braze_capabilities` plus one tool per supported operation: replace dots
with underscores and prefix `braze_`, e.g. `braze_editor_behaviors`. Discover first:

```sh
BRAZE_ENGINE_URL=http://127.0.0.1:5179 node scripts/engine-agent.mjs capabilities
BRAZE_ENGINE_URL=http://127.0.0.1:5179 node scripts/engine-agent.mjs request request.json
```

Use the URL from `./start.sh --status`; CLI and MCP default to 5179.
Discovery: `GET /api/automation/v1/capabilities`. Execute:
`POST /api/automation/v1/commands` with JSON and `X-Braze-Automation: 1`.
The CLI supplies `version: 1` and a request ID. Cross-origin browser writes reject.
Command payloads never execute JavaScript; trusted project source is compiled.
The HTTP `operationCatalog` supplies MCP descriptions, JSON input schemas and
read/write annotations. MCP validates payload shapes; the same engine owners
still validate semantics and perform edits. See [MCP setup](./OPERATIONS.md#mcp-connection).

| Area | Operations |
| --- | --- |
| Saved documents | `scene.list/inspect/validate/edit` |
| Assets | `assets.list` with pagination and stable GUID/subasset records; `assets.import` for previewed local media imports |
| Prefab assets | `prefab.create/inspect/edit`; saved GUID graphs, stable local node IDs, preview and revision checks |
| Input authoring | `input.map.create/inspect/save`, `input.project.inspect/select`; saved GUID assets, preview and revision checks |
| Behavior definitions | `editor.behaviors` with stock/project IDs, versions and typed fields/defaults/bounds |
| Game UI | `uiCanvas` scene component, `editor.ui` runtime inspection and public `context.ui` layouts/actions/tweens |
| Live authoring | `editor.sessions/status/inspect/validate/edit/save/undo/redo/select/camera` |
| Scene workspace | `editor.scene.list/create/open/copy/rename/delete` |
| Runtime | `editor.transport/physics/query/events/mesh` |
| Native playtests | `browser.inspect/input/capture` using the owned dedicated browser |
| Static export | `project.export.start/status/cancel` using saved revisions and isolated output |

Edits create/update/delete objects and set/remove Rigidbody, Collider, Character
Controller, Joint, saved Behaviors, UI Canvas or Animator. Patches cover name, tags, color, visibility,
hierarchy and transforms. Imported models require discovered AssetRefs.
Prefab overrides and broader material/import-settings commands remain gaps. Discover behavior definitions with
`editor.behaviors` before writing saved envelopes; never infer IDs from labels.
This uses the Inspector's registry and imports trusted project definitions without
starting a Play world. Project top-level code must not acquire runtime resources.

`assets.import` reads one absolute local `sourcePath` on the engine host (not the
MCP client), up to 128 MiB. Discover supported extensions. Set an exact Assets-
relative `destination`, including the matching extension. Preview hashes without
writing; apply requires its `sourceRevision`. Changed bytes conflict before
publication. Existing source files or sidecars reject; replacement/reimport,
remote URLs, scripts and metadata imports are unsupported. Import external model
buffers/textures first, preserving relative layout; separate calls are not an
atomic bundle. Each applied receipt returns an AssetRef, size/hash and indexed
record with diagnostics. An indexing error after publication explicitly reports
`applied: true`; inspect `assets.list` before retrying a lost/failed receipt.
Index readiness does not prove browser decode/render readiness: a glTF record can
be `ready` while an external buffer is absent; check loader errors and requests.
Reload Project
after external imports, use the returned references in scenes/public scripts,
and verify rendered media in Play and export. Manual binary uploads share the
same writer; [asset ownership](./ENGINE_ARCHITECTURE.md#assets-and-prefabs) defines
collision and publication semantics. Import creates assets outside scene undo.

Saved prefab authoring uses `prefab.create/inspect/edit` with the same object and
component commands as scenes, bounded to 1 MiB sources. Create starts with a
Transform master root ID `root`; explicitly parent new nodes below it. Keep
stable node IDs and explicit collider IDs. Preview returns a provisional filename;
apply creates a fresh GUID without replacing an existing source or orphan sidecar.
Inspect by GUID, paginate nodes, and use the returned byte hash for edits. Invalid
graphs never partly apply. `runtimeSubset` separately reports supported spawning
components; `dependenciesVerified: false` means models, materials, registrations
and resource readiness still require Play/export checks. Editor-valid prefabs can
contain components outside that runtime subset.

These saved writes share Prefab Mode's queued store, conflict checks and backups.
They preserve open drafts, existing scene instances and scene undo; stale manual
Save keeps the draft and reports a conflict. Close/reopen Prefab Mode after an
external write. Manual authoring uses Hierarchy selection dragged into Project,
then single-click its tile, choose **Edit prefab** in Asset Inspector and use
Prefab Mode's Inspector, undo/redo and Save. Double-click instantiates into the scene. Public JavaScript
uses `context.prefabs.list/instantiate/destroy/isAlive/createPool`; declare saved
GUIDs in the project's `runtimePrefabs` source manifest (no registration tool or
UI yet). Each Play captures saved sources once; edits apply next Play/export.
Nested prefabs, variants and live instance overrides remain unsupported. Never infer runtime success from a successful saved write.

Input maps use `braze/input-action-map-v1` documents. Discover their complete action
and binding schemas before authoring; inspect `assets.list` or retain the GUID from
an applied `input.map.create`. Create/save/select preview by default; repeat with
`apply: true` to persist. Create allocates a fresh GUID and never overwrites a source;
its preview filename is provisional. Save replaces the complete document with the
byte hash from `input.map.inspect`. Project selection requires the separate input
section hash from `input.project.inspect`, with `assetGuid: null` to clear it.
Writes share the manual asset/project stores and backups, not scene undo. They do
not replace open Inspector drafts: stale manual saves conflict and retain edits.
Reload the Project/Settings view after external writes. Current Play captures stay
unchanged; the next Play/export reads saved input. Public `context.input` consumes
actions and provides session-only rebinds; runtime profile switching remains open.

Animator uses `component.set`/`component.remove` with `component: "animator"`
inside scene, live editor and saved prefab batches. Set replaces a complete
`braze/animator-component-v2` document with an embedded
`braze/animator-controller-v1` controller. The catalog exposes recursive state
machines, clip/blend-tree motions, parameters, transitions, events, overrides,
root motion and Behavior Map layout, with shared document budgets. Stable IDs
are required; preserve unrelated layers, states, layout and extension fields.
Inspect returns canonical encoded components in both scenes and prefabs.

Set requires a ready indexed FBX/glTF main model, matching manual eligibility.
Discover model, clip, Avatar and mask GUID/local IDs in `assets.list`. Shape,
graph-reference and document-budget failures reject the entire batch. Dependency
availability and playable runtime configuration still require Play/export checks;
an authored empty state machine is valid but cannot play. Legacy external
controller references are read-only; embed their controller to edit, or remove
without recovering a missing model. Manual authoring uses Animator Inspector and
Behavior Map with the same scene/Prefab Mode history and save. Public scripts
use `context.animation` with stable parameter IDs; see
[Animator semantics](./CHARACTER_SYSTEM.md).

## Safe live editing

Discover sessions and identify one intended tab. Inspect before editing:

```json
{"operation":"editor.inspect","sessionId":"from-discovery","offset":0,"limit":100}
```

Live edits use numeric revisions and object history; saved-scene edits use byte
hashes and do not update a tab's unsaved state. Preview with the inspected revision,
then repeat with `apply: true` after checking the result. Preview is a technical
check, not an extra approval gate.

```json
{
  "operation":"editor.edit", "sessionId":"from-discovery",
  "sceneId":"current", "baseRevision":3,
  "commands":[
    {"op":"object.create","id":"ball","primitive":"sphere","values":{"position":[0,3,0]}},
    {"op":"component.set","id":"ball","component":"collider","values":{}},
    {"op":"component.set","id":"ball","component":"rigidbody","values":{}}
  ]
}
```

Include inspected `sceneInstanceId` for lifetime checking. One batch is atomic
and one live undo entry. Invalid physics cannot apply. Play/Prefab mode, locked
objects and linked prefab override edits reject. Deletion includes descendants
and protects the last camera/object. Physics `component.set` merges; Behaviors
UI Canvas and Animator replace complete documents, so preserve unrelated entries. Collider values.id
edits a shape; omission adds one. Transforms are parent-local, rotations degrees.

Workspace create/open/copy/rename/delete execute immediately, without edit previews.
Opening saves the source; conflicts prevent switching. Poll loaded/scene identity
and inspect a fresh revision afterward. Delete requires the saved catalog revision
and uses recoverable Trash. The connection survives scene changes; revisions
increase across scenes. Paginate inventory; live pages cap at 200 objects.

Only one request may be pending per tab, with a 15-second receipt timeout.
SSE owns an ephemeral receipt token. Disconnect rejects pending work and never
replays it. Request IDs correlate; they are not durable idempotency keys. After
conflict, timeout or lost receipt, inspect before retrying. Never broadcast writes.
MCP engine errors use `isError` and preserve the engine's structured envelope,
including disk conflicts and actualRevision. Invalid MCP input shapes fail before
dispatch with SDK validation details. Cancellation/connection closure aborts the
adapter's HTTP wait; it cannot undo a command already dispatched. The editor may
stay busy until that receipt completes or times out. Never infer rollback from
cancellation, and never automatically retry an uncertain write.

## Play and observe

Transport accepts play/pause/step/stop. Successful Play does not prove asynchronous
GPU readiness: inspect status and diagnostics. Physics commands queue for the next
fixed tick. Impulses accumulate; velocity replaces; persistent force sets and zero
clears. Avoid ambiguous mixed velocity/impulse commands. Paused worlds need Step.

Queries require `scope: "static"` and raycast/sphere-cast/capsule-cast. Character
moves return constrained command poses; the caller supplies gravity/jump. Neither
reports moving GPU positions. Events drain bounded collision/trigger transitions
on demand with overflow. Mesh capture supplies object-local static triangles in
Edit Mode for explicit baking. See [physics](./PHYSICS_ENGINE.md).

`scripts/engine-browser.mjs open`, `inspect` and `screenshot <path.png>` use a
persistent dedicated browser, normally control port 9339; inspect reports its
session ID. `browser.inspect` discovers those sessions through HTTP/CLI/MCP;
`browser.capture` returns a PNG (native image content in MCP), and `browser.input`
sends bounded native Game input to an explicit session. UI targets use stable
screen/node IDs from `editor.ui`; keyboard steps require Game/UI focus. Actions
arrive on the next fixed tick: observe the changed UI before dependent input.
No arbitrary selectors, scripts, shell commands or implicit tab selection are
accepted. The helper never creates/closes a tab; its launcher owns the browser.
View returned images before claiming appearance. Use isolated owned servers and
projects for acceptance. See [OPERATIONS.md](./OPERATIONS.md).

`project.export.start` takes a saved scene revision, builds through the ordinary
player compiler and budget gate into a fresh temporary directory, and returns a
job ID. Poll `project.export.status`; use `.cancel` to stop its build process.
Save live edits first. Source/assets must stay unchanged during compilation;
this is not an atomic project snapshot, a typecheck, a publication or proof of
playability. Open the resulting static player and test it without editor APIs.
One job can run at a time; 16 receipts survive until server restart. Successful
output belongs to the caller and remains on disk; clean it when no longer needed.

## Next delivery

1. Complete missing prefab-instance/material-settings authoring and richer command schemas
   through existing owners; verify revisions, undo and invalid payloads.
2. Extend the MCP adapter as operations land in the shared catalog; keep session,
   error, cancellation and transaction semantics covered through the actual wire.
3. Extend the tested native input/capture/export tools with richer gameplay
   diagnostics and asset workflows, without dynamic GPU pose mirrors.
4. Extend the [JavaScript SDK/project workflow](./GAMEPLAY_RUNTIME.md#javascript-projects)
   with editor script creation, asset fields and richer diagnostics. Classes,
   explicit registration, saved fields and a playable CLI scaffold are implemented.
5. Run a plain game request through authoring, refinement, reload and export.
   Add chat/provider adapters over the proven tools; keep credentials out of players.

## Keep the guides synchronized

[README](../README.md) indexes eight authoritative engine guides. This guide
owns product/agent acceptance and tools; rulebook owns development constraints;
architecture owns editor/persistence/rendering; gameplay owns scripting;
character/physics own specialized semantics; operations owns commands; status
owns completion/evidence. Update affected types, schemas, examples, skill routing,
tests and the owning guide in the same change. Requirements stay labeled until
verified. Remove superseded instructions; add no parallel plans or step reports.
History belongs in Git, run output in test artifacts. Source-local integration
contracts remain beside their code. `npm run check:docs` checks the guide set,
local links and routing; semantic accuracy still requires review.
