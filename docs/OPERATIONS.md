# Development, verification and review

This guide owns runnable procedures. [STATUS.md](./STATUS.md) owns results;
[AI_GAME_DEVELOPER.md](./AI_GAME_DEVELOPER.md) defines required agent acceptance.
Commands below run from the engine repository root unless noted.

## Owned editor server

```sh
./start.sh
./start.sh --status
./stop.sh
```

One checkout owns one supervised process group and HTTP/HMR pair, normally
5179/25179. Repeated start reuses the owner and selected project. Status shows
PID, project, ports and .dev-logs/server.log; ownership is recorded in .dev.pid
and .dev-logs/server.json. Start/stop share a lock and validate process identity.
Never kill unrelated listeners or create a second persistent review server.

PORT selects HTTP; VITE_HMR_PORT (legacy HMR_PORT) selects HMR, otherwise HTTP+20000.
BRAZE_PROJECT_ROOT selects a project. Without it, a new launch uses the ignored
`.braze/workspace/` directory inside this checkout. Sibling directories are never
automatically opened. Explicit conflicting settings require
./start.sh --restart. Foreign port occupancy fails clearly, without silent fallback.
Use ./stop.sh to clean owned children. Source changes use normal reload; entry
path/startup capacity/catalog changes require a restart.

Review launchers create isolated temporary projects and select them through
start.sh --restart. Save user work before switching and reload tabs afterward.
To return to the local default workspace use ./start.sh --restart with no overrides.
Review projects are retained and never copied into another project. Do not automatically
switch a user's editor merely to run automated checks.

Automated servers belong to their test harness, use isolated projects/ports and
must be torn down before handoff. npm run dev is a foreground process, not the
persistent manual server. Vite ignores generated dist-player, test-results and
playwright-report trees so tests do not reload a live editor; source HMR remains.

## Required checks

```sh
npm run check:docs
npm run check:architecture
npx tsc --noEmit
npm test
npm run build
```

Runtime, persistence, resource lifetime or scale changes also require
npm run test:soak. UI/runtime changes run relevant browser/WebGPU specs. Use
npm run verify:runtime for the full architecture/types/unit/build/soak/runtime
browser pipeline. It does not replace agent-game acceptance or manual feel review.
Do not raise file or bundle budgets to make a change pass. git diff --check and
review of unrelated/user changes complete handoff.

The docs gate checks the canonical guide set and local Markdown links. It cannot
prove claims correct. Update capability schemas, public examples, skill and the
owning guide together; keep current results in STATUS rather than feature notes.

After changing the canonical skill, synchronize an installed copy explicitly:
`npm run sync:skill -- /path/to/skills/braze-game-developer`, then repeat with
`--check`. It updates the entry/UI metadata and removes the three retired bundled
manuals; other resources remain. The repository owns the instructions.

## MCP connection

Start/inspect the owned engine server, then generate a stdio host entry:

```sh
./start.sh --status
BRAZE_ENGINE_URL=http://127.0.0.1:5179 node scripts/engine-mcp.mjs --config
```

This prints a standard `mcpServers.braze` JSON entry with the absolute Node/script
paths and engine URL. Add it to your MCP host's server configuration (translate
the command/args/env fields if its format differs), then reconnect that server.
The command changes no host settings. Run `npm install` in this checkout first;
the adapter uses the pinned [official MCP SDK](https://ts.sdk.modelcontextprotocol.io/v2/).
Both legacy initialization and modern discovery use the same stdio server factory.
The test suite connects real SDK clients over child-process stdio.

The host launches `node /absolute/braze-engine/scripts/engine-mcp.mjs`. Use that
direct command, not npm's banner-producing wrapper, for protocol stdout. The
adapter emits diagnostics only on stderr, exits on stdin closure, and never starts,
restarts or switches an editor server. It accepts loopback HTTP origins only and
rejects redirects. A stopped/incompatible engine produces a connection error.

Verify `tools/list` exposes `braze_capabilities` and the supported `braze_*` tools,
then call capabilities and `braze_editor_sessions`. Select the intended tab;
there is no default write target. Reconnect after engine capability changes.
`structuredContent` carries the HTTP result envelope; `isError` marks engine or
transport errors. No automatic retry occurs. Cancellation stops waiting, not
already dispatched work: inspect before retrying. Disk revisions are strings;
live revisions are numbers. Scene edit tools preview unless `apply: true`.

The adapter provides authoring, native input, image capture and bounded export
jobs through the shared operation catalog. Project source writing uses the agent's
filesystem tools; no arbitrary shell/eval MCP tool is exposed. Saved Input Action
Map creation/inspection/saving and project selection use the five `input.*` tools.
Their writes preview by default; map and project-input-section revisions are
different. Reload open asset/settings views after external writes; dirty drafts
remain unsaved and stale saves conflict. `assets.import` previews one local engine-
host source, then applies with its source hash into a new Assets-relative path.
It supports models/images/fonts/buffers up to 128 MiB without putting binary data
in MCP messages. Import dependencies first with relative paths intact; inspect
the returned index diagnostics and verify browser rendering. Replacement/reimport,
remote URLs and atomic bundles are unsupported. `prefab.create/inspect/edit`
author saved reusable graphs through the manual Prefab Mode document store. Use
GUIDs and source revisions, inspect runtime-subset diagnostics, and reopen Prefab
Mode after external edits. Verify manual Inspector undo/save, stale draft conflict,
two script consumers, Stop/restart and static export. Catalog registration uses
the project's `runtimePrefabs` source manifest. Animator uses the shared component
commands and Inspector/Behavior Map. Live prefab overrides and variants remain gaps in [the agent contract](./AI_GAME_DEVELOPER.md).

Project JavaScript/TypeScript edits are accepted at the project-module boundary.
The active Play keeps its existing instances; Stop/Play loads updated entry and
nested modules. Unsaved scene state and undo remain in the editor. This fixes the
provider invalidation seen during earlier acceptance. Project top-level modules
may re-evaluate on an edit, so acquire runtime resources only inside owned
lifecycle callbacks. Source/configuration changes outside this boundary can still
require a server restart or editor reload; see the scripting guide.

### Native playtests and export jobs

Start the dedicated browser with
`BRAZE_ENGINE_URL=http://127.0.0.1:5179 node scripts/engine-browser.mjs open`.
`BRAZE_BROWSER_PORT` defaults to 9339; set the same value on the engine server and
browser launcher to use another owned CDP port. Never attach an unrelated browser.
Discover `browser.inspect`, choose one session, open Game, Play, inspect readiness,
then call `browser.input` with steps such as:

```json
{"sessionId":"discovered-id","steps":[{"kind":"focus"},{"kind":"key","key":"KeyW","durationMs":250},{"kind":"ui","screenId":"hud","nodeId":"help","action":"click"}]}
```

MCP tool names use `braze_browser_input`, `braze_browser_capture`, etc. HTTP/CLI
use the same operation names with the usual version/requestId envelope. Input
allows 1–32 steps and five seconds of declared duration (two seconds per held key,
one second per wait); operations stop at a 15-second deadline. Physical key codes
exclude global modifier shortcuts. Native UI fill/check/focus and normalized Game
pointer coordinates are supported. Partial failure or cancellation stops remaining
steps and releases held keys; already-delivered input is not rolled back or replayed.
Inspection after an uncertain result is required. Input may foreground that browser.

Capture accepts `area: "game"` (default) or `"editor"`, maximum 4096 CSS pixels per
side and 8 MiB PNG. MCP emits an image plus metadata; HTTP returns base64. View it.
The existing standalone `engine-browser.mjs screenshot <path.png>` remains available.

To export through MCP/CLI, save the scene, inspect its disk hash with `scene.inspect`,
then call `project.export.start` with `sceneId` and `baseRevision`. Poll `.status`
with its `jobId`. One job runs at a time with a three-minute deadline and 65,536-character log
tail. `.cancel` waits for the child process and removes unfinished output. The job
uses the same Vite player compiler and budget checker as the manual export below;
it does not run project typechecks or publish anything. Receipts retain 16 jobs
until server restart. Successful temporary outputs remain yours to review/clean.
Do not edit source/assets during export; the saved scene revision is checked again
at completion, but the project is not snapshotted. Test the static player afterward.

## Browser matrix

npm run test:runtime-browser runs configurations sequentially with distinct,
owned test lifetimes. Inspect scripts/lib/runtime-browser-verification.mjs for
the authoritative suite list. Use npm run test:runtime-browser -- --list to inspect variants; run individual
suite commands below when narrowing. The runner has no filter option.
The stock variants need a foreground-capable browser for real pointer capture.
Headless pointer rejection is not proof of working native capture.
For headless WebGPU checks, use Playwright's managed full Chromium:
`chromium.launch({ channel: 'chromium' })`.
Neither automated verification nor the visible browser launcher forces unsafe
WebGPU support or bypasses the browser's adapter blocklist. A supported native
WebGPU adapter is required; inspect browser/GPU diagnostics if none is available.
After changing launch flags, close and reopen only the owned review browser;
a page reload cannot change process flags.
Install it with `npx playwright install chromium` if absent. The default headless
shell can select a different adapter; a blank capture or running tick counter
does not establish rendered output. Record the actual browser/adapter when
investigating failures, and keep screenshots as evidence.

| Area | Command / variants |
| --- | --- |
| Game lifecycle, timing, spawn, prefabs, pools, tags | npm run test:gameplay-browser |
| Saved behaviors/Inspectors | npm run test:behavior-browser |
| JavaScript scaffold, class discovery, Inspector editing and static export | npm run test:scripting-browser |
| MCP saved/live revisions, source import, input asset/project selection, manual collision/conflict recovery, undo/save and keyboard gameplay | npm run test:mcp-browser |
| Responsive game UI, Inspector, actions, tweens and standalone HUD | npm run test:ui-browser |
| Authored destruction | npm run test:destruction-browser; BRAZE_DESTRUCTION_WITHOUT_PHYSICS=1 variant |
| World animation | npm run test:animation-world-browser; BRAZE_ANIMATION_WITHOUT_PHYSICS=1 variant |
| Imported models | npm run test:models-browser; BRAZE_MODELS_FORMAT=glb BRAZE_MODELS_WITHOUT_PHYSICS=1 variant |
| Animated models | npm run test:runtime-animation-browser; BRAZE_RUNTIME_ANIMATION_WITH_PHYSICS=1 variant |
| Input assets | npm run test:input-assets-browser |
| Runtime capsule characters | npm run test:runtime-characters-browser |
| Stock controls | npm run test:stock-controls-browser with BRAZE_STOCK_CONTROLS_STYLE=first-person/third-person/top-down |
| Scripted replacement/pools | BRAZE_STOCK_CONTROLS_SCRIPTED=1 npm run test:stock-controls-browser |
| Static export smoke | npm run test:player-browser |

Physics shadow-buffer regression is tests/browser/physics-pose-lifetime.spec.ts:
Play/Stop, fresh Scene/Game view attachment, orbit/resize redraws, visible caster
pixels and GPU uncaptured errors. Disabling shadow-caster invalidation in the
isolated negative control must fail. Related specs: physics-playback-pacing and
viewport-idle. Do not introduce polling/readback into production to test it.

Assert live grounded positions with a justified numerical tolerance; paused or
disabled snapshots remain unchanged. Test Animator hold with a true zero-speed
state: a bound speed parameter overrides the scalar. Pixel checks compare actual
motion to a static baseline and exclude HUD/borders; do not loosen thresholds
simply to accept failure.

## Manual review

Run only the relevant review launcher. Every review checks actual visible output,
Console diagnostics, Pause/Step, Scene/Game switching, hiding/restoring views,
Stop/restoration, fresh Play and saved edits after reload. Test Inspector undo/redo
and keyboard/text focus for changed authoring. Agent acceptance also uses public
commands/scripts and an independently assessed game brief.

| Fixture | Launcher | Distinct checks |
| --- | --- | --- |
| Lifetime | review:runtime | One startup across view changes; hidden Stop disposes once; no hidden backlog. |
| Timing | review:timing | Walk 120 ticks reaches the declared 6 m result; Pause/Step counts once. |
| Identity | review:entities | Create/remove; old handle rejection; atomic batch rejection; restart resets. |
| Primitive spawning | review:spawning | Visible falling box/sphere; remove one/all; neighbors continue unaffected. |
| Prefabs | review:prefabs | Independent complete graphs; stale instance; source save affects next Play. |
| Pools | review:pools | Acquire/return/reacquire fresh defaults; capacity error; retirement then disposal. |
| Tags | review:tags | Catalog and open/saved usage; prefab tag override; bounded query total/truncated; reacquire defaults. |
| Behaviors | review:behaviors | Inspector values/reference persistence, disabled construction, one Start, cleanup and missing definitions. |
| Destruction | review:destruction | Remove group/wall/hero; static motor sees removed wall; Stop restores all. |
| Animation | review:animation | Normal/Unscaled/Fixed actors; pause once, one event across two views, remove one. |
| Models | review:models | Independent colored/textured instances; lazy loading may need second Step; view reopen and lease cleanup. |
| Animated prefabs | review:runtime-animation | Independent skins, parameter changes/hold, fresh pool cursor, model teardown. |
| Input maps | review:input-assets | Create/save/select/reload; saved changes apply next Play; session rebind resets; rename/missing/restore. |
| Capsule characters | review:runtime-characters | Independent grounding/wall/jump, stale motor rejection, fresh pool state and root-motion skin. |
| Stock controls | review:stock-controls | FPS/TPS/top-down motion/facing, native mouse look, gamepad, wall/jump, camera restoration and saved tuning. |

Run launchers as npm run <name>. Stock review accepts BRAZE_STOCK_CONTROLS_STYLE;
BRAZE_STOCK_CONTROLS_SCRIPTED=1 adds competing-owner rejection, disable stock →
attach custom → walk, pool reuse, stale handles and text-focus isolation.
BRAZE_RUNTIME_ANIMATION_WITH_PHYSICS=1 adds animated dynamic model review.
No review launcher constitutes a passed test until its outputs are assessed.

## Player build

```sh
npm run build:player
npm run check:player-build
npm run preview:player
```

Default input is the configured project's scenes/current.scene.json. Override
BRAZE_PROJECT_ROOT and BRAZE_PLAYER_SCENE_ID before build. Preview is normally
http://127.0.0.1:4173/player.html and API-free; stop its foreground process after use.
Deploy the complete dist-player directory, including hashed assets,
player-content.json and copied model/HDRI dependencies. Relative URLs support
subpath hosting. Publishing requires the user's requested deployment scope.

The artifact excludes App/editor panes, editor styles, persistence/save APIs,
previews, Orbit/Transform controls, grid, labels, picking and editor navigation.
A small bootstrap loads manifest-selected runtime features. Disabled physics,
particles, water, cloner, post effects and unused loaders are pruned and checked
by player-topology.json. Source entry, saved input selection and registered
runtime prefab dependencies are compiled/captured; the player fetches no editor
API. Missing selected assets/configuration fail rather than silently fall back.

Prefab-only models, external glTF buffers/images, FBX textures, saved materials,
Animator clip/Avatar/mask/import dependencies retain required runtime features.
A nonzero runtimePhysicsCapacity retains physics even with no initial body.
Only the active HDRI is shipped. Unsaved editor or asset drafts are excluded.
The same supported runtime subset/limits applies in editor and static player.

For isolated acceptance artifacts, choose a separate output directory instead of
overwriting the checkout's player output (run the usual type checks first):

```sh
BRAZE_PROJECT_ROOT=/path/to/game npx vite build --config vite.player.config.ts --outDir /path/to/run/dist-player
```

Then run `node /absolute/braze-engine/scripts/check-player-build-budgets.mjs`
with `/path/to/run` as the working directory. That checker reads `dist-player`
relative to its working directory. Keep any static test server owned by the
harness and stop it after playing the artifact.

Build gates check entry/vendor/total raw JS, player initial graph, gzip/Brotli
and exclusion topology; package/binary assets are separately reported. Constants
in scripts/lib/*build-budget.mjs are authority. The editor limits remain 500 KiB
main entry, 650 KiB vendor group, 3,200 KiB total emitted JS. Do not substitute a
successful dev server for a verified production artifact.

## Console and performance evidence

Open Console with its toolbar action or Ctrl/Cmd+Shift+C. It mirrors browser
console methods, uncaught errors, rejected promises and structured renderer /
Animator diagnostics. The bounded process-local store retains 2,000 entries.
Clear, Collapse, Clear on Play, Error Pause, timestamp, search and severity filters
are editor preferences. Copy selected/visible includes full diagnostic details;
clipboard failure leaves selectable text. No logs enter authored project data.

Stats lives in Game, never Scene. RAF opportunity is shared frame cadence; device
work is admitted callbacks; queue retired is completed submission epochs. None is
presented FPS. Render Hz is submitted viewport cadence. GPU render window is
Three's aggregate render timestamp sample, possibly multiple views, not per-effect
time. JS heap is browser heap, not GPU memory; Three memory counters are estimates,
not driver allocation. Unavailable timing stays unavailable. ?gpuTiming=1 explicitly
enables timestamp diagnostics; the normal renderer does not pay that cost.

Performance claims need the same representative scene/configuration and real
adapter before/after, recorded with browser/device/revision and p50/p95/p99.
Software WebGPU timings are not hardware acceptance. Soak tests use operation
counts, capacities and disposal rather than flaky wall-clock thresholds. Logs,
traces and screenshots are artifacts; retain a runnable fixture and concise
receipt in STATUS/change description. Never equate test count with feature parity.
