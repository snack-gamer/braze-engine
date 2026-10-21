---
name: braze-game-developer
description: Build and verify games or reusable gameplay systems in a Braze workspace through its discoverable tools, public JavaScript API and live editor. Also use for agent acceptance of engine changes; not for unrelated web apps.
---

# Braze Game Developer

Locate the engine repository by its package.json (name: braze-engine) and the intended game
project. Read its AGENTS.md. Read these paths from that repository, including
when this skill is installed outside it:

- `docs/AI_GAME_DEVELOPER.md`: mandatory agent acceptance, current
  tool protocol, revision/receipt rules and honest capability claims.
- `docs/GAMEPLAY_RUNTIME.md`: JavaScript project layout, behavior
  classes/registration, public systems and lifetime. Read when writing scripts.
- `docs/OPERATIONS.md`: server ownership, checks and export.
- `docs/PHYSICS_ENGINE.md` or `CHARACTER_SYSTEM.md` only when the
  requested physics/animation work needs their specialized contracts.
- `docs/STATUS.md`: known gaps; live discovery remains authoritative.

Do not create copied reference manuals in this skill. Its repository copy is
canonical; synchronize installed copies after changes using the documented tool.

## Build through supported capabilities

Inspect `./start.sh --status` at the engine repository root. When connected, use the Braze MCP
tools: `braze_capabilities`, then `braze_editor_sessions` for live authoring.
Each operation maps to `braze_` plus its name with dots replaced by underscores.
If MCP is not connected, the same API is available through
`BRAZE_ENGINE_URL=<owned URL> node scripts/engine-agent.mjs capabilities`.
MCP setup is in OPERATIONS.md; do not assume the host has installed it.
Use the existing server; persistent review servers use start.sh. Do not replace
an active user's project to run tests. Tests use isolated projects and cleanup.

Turn the user's brief into a small playable milestone with observable outcomes.
Clarify only creative/technical choices that materially affect it. Inspect scenes
and assets; use discovered GUID/local IDs. Prefer versioned authoring commands
for supported edits. Write custom project JavaScript through public APIs, with
reusable behaviors/systems in their project folders. Never smuggle executable
code through scene JSON or claim a missing tool exists.

For live work discover editor.sessions, identify one intended tab and inspect
it. Use numeric live revision, scene identity and editor.edit preview, then apply
through the same history/persistence owner. Preview is a technical check, not an
approval gate. Saved scene writes use disk revisions and cannot overwrite an
open tab's unsaved state. Conflicts, disconnects and lost receipts require fresh
inspection before retry; request IDs do not provide durable idempotency.
MCP cancellation ends waiting but cannot undo dispatched work; inspect before
retrying. Engine errors appear as isError with a structured response envelope.
Discover `editor.behaviors` before attaching custom/stock saved types.
Bring local models, images, fonts and model buffers in through `assets.import`.
Discover its limits; preview an absolute engine-host source path and an exact
Assets-relative destination, then apply with the returned source hash. Import
external dependencies first with relative paths intact; calls are not an atomic
bundle. Existing sources/sidecars reject, so choose a new destination. Retain the
AssetRef, inspect index diagnostics, reload Project and verify actual rendering.
URLs, scripts, metadata and replacement/reimport need separate workflows; see
the import contract in AI_GAME_DEVELOPER.md. A lost receipt requires inspection.
Author saved reusable graphs with `prefab.create/inspect/edit`. Create provides a
Transform master root ID `root`; parent explicit local node IDs beneath it. Preview
first, retain the returned GUID, paginate inspection and use the source hash for
edits. Inspect `runtimeSubset` diagnostics; these do not verify dependencies. Use
the runtime-supported components documented in GAMEPLAY_RUNTIME.md and declare
GUIDs in project `runtimePrefabs` source. Public scripts instantiate/pool through
`context.prefabs`; no catalog registration tool/UI exists yet. Saved changes leave
open Prefab Mode drafts and scene instances unchanged. Reopen the asset after
external edits; stale manual saves conflict. Verify next-Play capture, two reuse
configurations, manual Prefab Mode undo/save and static export. To enter Prefab Mode, single-click
the Project tile then choose Edit prefab in Asset Inspector; double-click instantiates. Nested prefabs,
variants and live overrides remain gaps.
Author Animator through `component.set`/`component.remove` in scene/live/prefab
batches. Discover the embedded document schema and budget before writing; retain
stable IDs and unrelated Behavior Map layout. Set requires a ready imported
FBX/glTF main model. Discover clip/Avatar/mask AssetRefs; never infer local IDs.
Full documents replace the component through the same codecs and model eligibility
as Animator Inspector. Legacy controller references must be embedded before
editing. Invalid shapes/graphs reject atomically; saved validity does not prove
dependencies or runtime playback. Verify visible motion, input-driven transitions
via public `context.animation`, two configurations, manual Inspector/Behavior Map
undo/save, reload and static export. Incomplete nonplaying controllers can be saved;
inspect Play diagnostics. Project source edits preserve current Play and scene
drafts; Stop/Play loads updated modules. Reload behavior definitions refreshes the
manual catalog. Never acquire runtime resources at module top level, which hot
updates re-evaluate.
Create game controls with discovered `input.map.create/inspect/save` schemas;
include every action required by the chosen behaviors. Keep the returned GUID.
`input.project.inspect/select` selects that saved map or explicitly clears it
with `assetGuid: null`. Preview writes, then apply. Map saves use their source
hash; selection uses the separate project input-section hash. These are saved
asset/project writes, not live scene edits or scene undo. Open Inspector drafts
are preserved and stale saves conflict; reload views after external writes.
Play captures saved controls once. Verify old/new keys across Stop/restart,
manual Save/Revert, and export. Script `context.input.rebind` is session-only.
The manual Project input dropdown saves immediately; **Use for project** instead
selects the currently inspected asset, so do not click both to apply a dropdown choice.
Game UI uses saved uiCanvas components or context.ui screens. Read the responsive
UI section of GAMEPLAY_RUNTIME.md, inspect recursive schemas, and bind named
actions in trusted project scripts. editor.ui observes runtime values/tweens;
`browser.inspect/input/capture` exercise the dedicated browser and expose images
through MCP. Use stable IDs, wait for fixed-tick action outcomes, and view captures.
UI images/fonts use discovered AssetRefs. Declare script-only media in the project
`uiAssets` manifest before export. Enable document navigation for controller menus;
inspect resource readiness/focus through editor.ui and verify narrow/wide layouts.
Save then use `project.export.start/status/cancel` with a saved revision for an
isolated build; play the output and check it makes no editor API requests.

When a requested mechanic lacks a public tool/API, record the gap and its impact.
Within authorized engine-development work, implement through the feature owner,
then rerun the public workflow. During acceptance, engine-internal edits count as
a failed capability attempt and a new implementation iteration, not a successful
agent-only build. Content-only requests do not silently expand into engine work.

## Verify the actual game

Follow the acceptance contract: inspect saved artifacts, enter Play, check
readiness/diagnostics, exercise representative input, inspect rendered output,
and test the changed lifetime/reuse. Reopen the project. For a playable milestone,
build and run an API-free static export. Use the persistent browser helper for
visible demonstrations or available browser tools, and view captured screenshots.
No button click, passing serialization test or screenshot alone proves gameplay.

Check the corresponding manual Inspector/editor/script workflow. Report actual
results separately from pending human control feel or real-hardware measurement.
Assess a second configuration for reusable systems. Keep a compact receipt with
brief, revision, artifacts, tool gaps, intervention, outcomes and remaining limits.
Do not create another Markdown step report; update the owning guide and current
STATUS entry for engine work. Preserve the user's authored project.
