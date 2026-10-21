# Gameplay and JavaScript scripting

This is the public project scripting and reusable-system contract. Runtime
implementation status and acceptance evidence belong in [STATUS.md](./STATUS.md).
Agent and manual delivery requirements belong in [AI_GAME_DEVELOPER.md](./AI_GAME_DEVELOPER.md).
Public types are authoritative in [gameplay/public.ts](../src/gameplay/public.ts).

## JavaScript projects

JavaScript ES modules are a first-class project language. TypeScript is optional;
engine implementation remains TypeScript. Projects write classes, functions and
reusable systems against public services, without editing engine internals.
Compile trusted source through `braze.project.json.gameplayEntry`; never put
executable strings, code-file paths or `eval` in scenes, components or tool payloads.
Project code runs with browser privileges; this is not an untrusted-code sandbox.

The conventional layout for new projects is:

```text
MyGame/
  braze.project.json       paths, gameplay entry, startup capacities/catalogs
  project.json             project libraries, tags, selected input AssetRef
  assets/
    Scripts/
      main.js              thin module composition root
      Behaviors/           reusable per-object behavior classes/registrations
      Systems/             project-wide game rules and services
      UI/                  reusable layout data and presenters
    Prefabs/               reusable authored graphs and sidecars
    Models/                source models and sidecars
    Materials/             reusable materials
    Input/                 Input Action Map assets
    Audio/                 content; runtime audio support is still planned
  scenes/                  named scene documents (existing storage contract)
  tests/                   project tests
  .braze/Library/           generated import data; do not author here
  .braze/Backups/           recovery data
```

Folders follow familiar engine authoring roles while preserving Braze's existing
configurable paths. Existing `src/main.ts`, lowercase folders and projects remain
valid. Do not move a user's assets or regenerate GUIDs merely to adopt this
convention. `Scenes` inside Assets, automatic script discovery, script compilation
UI and custom Inspector extensions require explicit implementation/migration;
this layout alone does not claim those capabilities.

Required scripting workflow: a stable public package import, JS-aware completion
and diagnostics, explicit class registration, one instance per attachment,
versioned serializable fields, source-to-error locations, and equivalent Play /
static-player behavior. A scaffold must create a working organized project,
reject overwriting existing content and be usable from both terminal and agent.
Generated SDK paths are relative to canonical project/engine directories, including
projects created through symlinked parents such as macOS `/tmp`.
Current delivered pieces and remaining work are listed in [STATUS.md](./STATUS.md).

### Create and extend a JavaScript game

From braze-engine run `npm run create:game -- /absolute/new-directory "My Game"`.
The parent must exist; an existing destination is rejected without modification.
The template copy creates `assets/Scripts` itself, so exclusive copy semantics
work on Node 22 as well as newer Node versions.
The Collect Three starter contains a playable top-down character, collectible
behavior class, score system, saved per-object fields and a jsconfig.json. It uses
the folder layout above. Open it with BRAZE_PROJECT_ROOT through the owned server
workflow in [operations](./OPERATIONS.md); preserve the user's current project.
WASD moves, Space jumps, E collects nearby orange cubes. A saved UI Canvas shows
score/progress; How to play opens an animated panel. Console also records outcomes.

Import runtime helpers/types from `@braze/game`. Editor and player resolve this
public entry; no engine-relative source import is needed. The generated jsconfig
resolves it for JSDoc completion and `npx tsc --noEmit -p <project>/jsconfig.json`.
This is a local SDK entry, not a published npm package. Existing imports remain
valid. Moving the engine checkout requires updating the generated config paths.

`ScriptBehavior` optionally supplies scope, values, context and default dispose.
`defineBehavior(metadata, BehaviorClass)` constructs one instance through the
existing registered behavior host. `defineGame({behaviors, input, create})` declares
a v1 module. Optional lifecycle methods are start/onEnable/fixedUpdate/onDisable;
override dispose for cleanup. Constructors and callbacks are synchronous; fields
are declared explicitly for Inspector persistence. No required base class, magic
file scan, decorators, private clock or alternate component store is introduced.

Add a JS file under Behaviors, export its registration, and import it in main.js.
In the editor reload definitions and add it through the ordinary Behaviors
Inspector. Project-wide classes live in Systems and are composed by create().
Agents discover the same IDs, versions and field schemas using `editor.behaviors`.
Use scope.defer/context.defer for ownership. Renaming source files must preserve
registration IDs and update imports, not rewrite saved component identities.

During development, edits to the project entry or its imported modules stop at a
Vite acceptance boundary. Existing Play instances retain their old closures;
Stop/Play calls the updated module. Scene drafts and undo survive. Definition
discovery via `editor.behaviors` reads the current module; use the Inspector's
Reload behavior definitions action for manually displayed definitions. Top-level project
code may re-evaluate during hot updates and must not acquire runtime resources.
Changing `gameplayEntry` or startup capacities in `braze.project.json` requires
restarting the owned server. Production exports contain no hot-update boundary.

## Project entry

`gameplayEntry` accepts a contained `.js`, `.jsx`, `.ts` or `.tsx` file. Absolute,
missing, escaping and external-symlink entries fail. A default export implements:

```ts
interface GameModule {
  version: 1;
  input?: InputActionMap;
  behaviors?: readonly BehaviorRegistration[];
  create(context: GameContext): GameInstance | Promise<GameInstance>;
}
interface GameInstance {
  fixedUpdate?(tick: GameTick): void;
  update?(frame: GameFrame): void; // presentation only
  dispose(): void;
}
```

`GameContext` exposes `world`, `prefabs`, `behaviors`, `input`, `animation`,
`characters`, `camera`, `ui`, bounded `events`, immutable initial `entities`, `signal`
and `defer(cleanup)`. It does not expose renderer/GPU objects, mutable scene data
or editor stores. Register ownership immediately, including during async create.
Late startup results are disposed. Stop invalidates retained ports. Keep module
initializers free of owned resources: Inspector discovery can import definitions
without creating a game. Restart the dev server after changing the entry path,
startup reserve or prefab catalog; source edits use normal module reload.

Stock saved controls work without a project entry. Custom behavior definitions
and runtime prefab catalogs use the compiled project module.

## Shared world and time

One Play world is owned by editor transport or the static player. Scene/Game
attach presentation and input without constructing another game instance. With
neither view active, new gameplay/physics scheduling suspends; submitted GPU work
may finish. Reattachment resumes without hidden-time catch-up. Pause retains
state and releases input; Step admits one tick when a view is ready. Hidden Step
requests coalesce. Stop disposes even without a view; new Play captures fresh data.

Physics owns the fixed clock when present. Each admitted tick:

1. commits one ready structural batch;
2. samples input and reconciles/changes behavior lifetimes;
3. flushes queued game events;
4. invokes project fixedUpdate, then enabled entity fixedUpdate callbacks;
5. advances Fixed Step Animator and flushes root-motion commands;
6. uploads sparse commands and submits that solver tick.

Deferred admission and async startup cannot advance gameplay ahead of physics.
No-physics scenes use the bounded gameplay clock. Render-phase update is
presentation-only and may run without a fixed tick. Movement is fixed-tick-only,
including event/behavior callbacks. Async work enqueues later work instead.
Submitted/completed/applied step IDs have distinct meanings; none is a CPU pose
mirror. Never await a GPU fence in an update or claim cross-device deterministic
replay. Authored topology/timestep changes require a fresh Play snapshot.

An uncaught project-module callback error ends gameplay, holds future physics
ticks and emits one structured diagnostic. Cleanup continues if another cleanup
throws. A behavior lifecycle error ends only that attachment. Shared event
callbacks retain their event service's global failure policy.

## Behaviors and classes

Registered behavior definitions associate stable type IDs with trusted factories.
Scenes/prefabs persist values, never executable code. The existing factory may
return a JavaScript class instance implementing the lifecycle; classes must
receive a fresh instance for each attachment. Do not use static mutable state
for per-object gameplay. Public class helpers use the same lifecycle owner.

```js
import { ScriptBehavior, defineBehavior } from '@braze/game';

class Countdown extends ScriptBehavior {
  expired = false;
  /** @param {import('@braze/game').RegisteredBehaviorScope} scope
   * @param {import('@braze/game').BehaviorValues} values
   * @param {import('@braze/game').GameContext} context */
  constructor(scope, values, context) {
    super(scope, values, context);
    this.remaining = Number(values.seconds);
  }
  /** @param {import('@braze/game').GameTick} tick */
  fixedUpdate({ deltaSeconds }) {
    if (this.expired) return;
    this.remaining -= deltaSeconds;
    if (this.remaining <= 0) {
      this.context.world.destroy(this.scope.entity);
      this.expired = true;
    }
  }
}

export const countdown = defineBehavior({
  id: 'game.countdown', label: 'Countdown', version: 1,
  fields: [{ key: 'seconds', label: 'Seconds', kind: 'number', default: 5, min: 0.1, max: 60 }],
}, Countdown);
// Include countdown in the default GameModule.behaviors array.
```

Objects/classes may compose public locomotion, camera, input, world and Animator
services. Project-wide systems belong in Systems and are instantiated by main.js;
main remains wiring. No engine rewrite or private world scan is an extension API.

Manual workflow: Add Component → Gameplay → Behaviors → select definition → Add
behavior. Edit typed values, enabled state, references, reset or remove; normal
undo/redo, dirty tracking and prefab override semantics apply. Reload behavior
definitions retries discovery. Unknown/missing/version-mismatched definitions
retain values and show diagnostics. Malformed future components remain inert and
round-trip. Explicit removal is the author's decision.

Persisted `behaviors` shape:

```json
{"version":1,"entries":[{"id":"timer-1","type":"game.countdown","typeVersion":1,"enabled":true,"values":{"seconds":5}}]}
```

Fields support finite bounded number, bounded string, boolean and entity reference
(`{entityId}` or null). Stable keys differ from display labels. Missing fields
receive defaults; zero/false/empty/null remain intentional. Values are copied,
validated and frozen. Unknown keys/extension metadata round-trip. Changing a
registered version requires explicit data migration, never inferred conversion.

Scene references resolve in the captured world; prefab references resolve only
inside the new instance. `scope.resolveEntity(reference)` returns a live handle
or undefined. Duplicating a subtree remaps internal references; external authored
references retain identity. Missing scene targets remain repairable. External
runtime prefab targets fail that attachment instead of binding another object.

`context.behaviors.attach(handle, definition, {enabled})` supports programmatic
attachments. `find(handle, 'saved:' + entryId)` finds an admitted saved entry.
Attachments provide read, setEnabled and detach; changes commit at a later fixed
boundary. Factories are synchronous. Construction occurs even if disabled;
first enable runs onEnable → start → fixedUpdate. Start runs once. Re-enable
retains instance state unless the policy explicitly resets itself.

Detach/removal/pool return/Stop runs onDisable when enabled, aborts the scope,
calls dispose(reason), then deferred cleanup in reverse order. Later defer calls
clean immediately. Disable alone does not abort. Stop cleanup can inspect
still-live metadata; committed removal cleanup sees stale handles. Promise-returning
factories reject and late instances are disposed. Async work must observe signal.

Limits: 128 combined engine/project definitions, 32 fields per definition, 32 values
per saved entry, 8 entries per entity, strings ≤1,024 characters, 256 live/queued
attachments and 256 queued commands, 32 cleanups per attachment. Duplicate engine /
project type IDs reject; custom systems use their own IDs. Bounded callbacks do
not bound arbitrary trusted JavaScript execution time.

## Responsive game UI

Game UI belongs to `src/game-ui`, separate from editor chrome. It renders safe
text and native controls in an isolated screen-space surface over the active Game
view. The same layout/runtime works in static players. Dynamic GPU poses are not
read back for UI. World-space canvases and world-following labels are unsupported.

Create a Transform, then **Add Component → UI → UI Canvas**. Select elements,
add/reparent/remove/reorder them and edit controls in the Inspector. Click the
preview to select a node; Layout and responsive styles edits base styles or an
ascending width breakpoint. Empty style fields remove overrides. Preview widths simulate
320–1440 CSS pixels through the same renderer. Full layout document edits expose
every property, including theme, anchors and responsive overrides; Apply is one
undo entry and rejects an out-of-date draft. Scene save/reload, duplication and
editor prefab component overrides retain canvases. Runtime prefab spawning rejects
UI Canvas explicitly; reusable script-created screens work. Invalid/future saved
documents remain inert, display a diagnostic and round-trip unchanged.

Agents use `component.set` with `component: "uiCanvas"` and a complete document.
Discover recursive schemas through capabilities; inspect and preserve existing
nodes before replacement. Scene persistence uses `ui_canvas`. Use normal preview,
revision, apply, Undo/Redo and Save. `editor.ui` lists ready Play screens; pass
`screenId`, `offset`, `limit` to read current node values/styles. These are runtime
observations, not authored edits or screenshots.

Documents contain `version: 1`, `enabled`, integer `order` (-1000…1000), `theme`
and a panel `root`. Nodes have local stable `id`, `kind` and optional `children`
(panels only). Kinds: panel, text, image, button, input, slider, toggle, progress.
Text/labels are literal strings, never HTML. Numeric controls use min/max/value
and optional step; toggle values are boolean, input values string. `disabled`
and `visible` apply through ancestors. Named `action` connects buttons/editable
controls to project callbacks without executable scene payloads.

Layout uses row/column flex, grid (fixed columns or auto-fit `cellMin`) and overlay.
Width/height/min/max sizes accept CSS pixel numbers, percentages or `auto`.
Use position `absolute` with top/right/bottom/left for anchors; flow is the default.
Gap, padding, grow, wrap, align, justify, overflow, font, border and radius are typed
styles. Colors accept hex, transparent/currentColor or `$token` references to
literal theme colors. No arbitrary CSS, external URLs or markup executes. A
`responsive` array applies ascending `minWidth` style overrides based on the Game
surface width, independent of the editor window. Panels/text pass pointer input
through by default; `pointer: "block"` creates an interactive panel.
For content-heavy scrolling menus, use root `overflow: "auto"` and
`pointer: "block"`, with `minHeight: "auto"` on content panels/controls that must
retain their intrinsic height. Otherwise flexible children may compress as new
content appears. Check the win/error state at the narrowest supported viewport.

```js
import { createUiCanvas } from '@braze/game';
const layout = createUiCanvas();
const screen = context.ui.create('scoreboard', {
  ...layout,
  root: { ...layout.root, children: [
    { id: 'score', kind: 'text', text: '0 points' },
    { id: 'bonus', kind: 'button', text: 'Bonus', action: 'bonus',
      style: { background: '$accent', color: '#102031', radius: 8 } },
  ] },
});
let points = 0;
context.defer(screen.on('bonus', () => {
  points += 3;
  screen.update('score', { text: `${points} points`, style: { scale: 1.2 } });
  screen.tween('score', { scale: 1 }, { duration: 0.25, easing: 'ease-out' });
}));
```

Put reusable layout functions/data and presenters in assets/Scripts/UI or Systems.
`context.ui.screen(objectId)` retrieves a saved canvas. `create(id, document)`
captures an independent copy and rejects duplicate IDs. `inspect(nodeId)` returns
a copy; `update(nodeId, patch)` changes image/text/label/value/visibility/disabled or
merges base style. Breakpoint overrides apply after base style. Runtime writes
never change scenes. Dispose removes a screen and revokes its handles. Stop/failure
clears all screens; authored owner destruction removes its canvas on the next tick.
Detaching/reopening Game preserves state and reconstructs presentation.

Native pointer, Tab, Enter/Space and text/range/checkbox keyboard behavior work
inside controls. Focused UI suppresses gameplay input and editor shortcuts. Hiding
a focused panel returns focus to Game. Actions deliver on the next fixed tick, so
world commands share the normal command scope. Text/range changes coalesce per
control; disabled/hidden controls and paused input discard actions. Callback errors
use the gameplay failure contract. Controls are inert during editor Pause; UI does
not own or silently change transport pause. Wait for the observed action outcome
before sending dependent input.

Tweens animate opacity, x/y in CSS pixels, scale and rotation in degrees. Options:
duration (0…3600 seconds, exclusive zero), delay, linear/ease-in/ease-out/
ease-in-out/back-out easing, repeat (0…100) and yoyo. They use the fixed game clock:
Pause holds, Step advances, hidden views do not catch up. Starting a new tween or
updating style cancels that node's previous tween. Handles expose `state()` and
`cancel()`; sequences compose in project code. Reduced-motion preference resolves
to the final state on the next tick. No private RAF/timer runs. Only active tweens
update DOM each tick; layout/resize work is event-driven. Avoid breakpoint overrides
of tweened properties when their base values should animate at every width.

Limits per Play: 32 screens, 256 nodes per screen/1024 total, depth 16, 128 active
tweens, 256 action registrations and 256 queued actions; eight responsive rules per
node. Bounds fail explicitly. Virtualized inventories, drag/resize handles,
localization, modal focus
traps, world-space UI and runtime UI-prefab spawning remain separate work.

### Image and font assets

Import PNG/JPEG/WebP/GIF/BMP images or WOFF/WOFF2/TTF/OTF fonts through Project's
Import Files or drag/drop. Fonts have a Project filter, preview Inspector and the
same rename/move/duplicate/delete identity lifecycle as other source assets.
`braze.font` uses settingsVersion 1 with empty settings; source files define the
face, while UI styles define size/weight/color. Unsupported metadata diagnoses an
unavailable font. Use fonts you have permission to distribute.

Image nodes use `image: { guid, localId?: 'main' }`, accessible `label` as alt text,
and style `fit: 'contain' | 'cover' | 'fill'`. Give them explicit width and height.
Any node style can use `font: { guid, localId?: 'main' }`; descendants inherit it.
The Inspector provides image/font selectors including a retained Missing entry.
References use Asset Database GUIDs, never authored URLs. Renames retain identity;
duplication creates a new GUID. Missing/failed assets retain references, show an
image placeholder or system font, and appear in `editor.ui.presentation.resources`.
That on-demand observation includes up to 200 resource nodes and current focus;
`null` presentation means no active Game surface. Restore source and .braze.meta
then restart Play to recover. Preview follows the live catalog; Play captures it.
Current-scene delete warnings count UI references, including breakpoint fonts;
they do not audit script literals or other scenes.

Saved Canvas dependencies export automatically. Script-created layouts must
list their dependencies explicitly in `braze.project.json`:

```json
{ "gameplayEntry": "assets/Scripts/main.js", "uiAssets": [
  { "guid": "0123456789abcdef0123456789abcdef" }
] }
```

`uiAssets` accepts at most 256 AssetRefs. Export resolves those and saved UI
references, fails for missing/wrong-kind dependencies, and copies only selected
assets. Keep layout functions in assets/Scripts/UI and source art/fonts in
assets/UI. Faces and image callbacks belong to one surface; detach/Stop removes
owned faces, and late font completions cannot revive a disposed surface.
Agents can create media AssetRefs with previewed `assets.import`; manual Project
import uses the same source writer. These are authoring operations, not runtime
filesystem access. Imported references feed the existing saved/script UI paths;
see [the import protocol](./AI_GAME_DEVELOPER.md#current-command-protocol) for source
limits, exact destinations and collision handling.

### Controller navigation

Add optional document `navigation: { enabled: true, wrap: true,
initialFocus: 'start', cancel: 'back' }`. Initial focus names an existing control;
cancel names an existing button. Omit navigation for passive HUDs. The Inspector
has an enable checkbox; advanced targets are available in the layout document.
With Game focused, a standard-mapped controller's D-pad/left stick enters the
highest-order enabled screen, then moves in authored tree order. A activates
buttons/toggles; left/right adjust sliders, up/down move between controls. Text
fields can receive focus but require a keyboard for entry. B activates the cancel
button when visible/enabled, otherwise returns focus to Game. Hidden/disabled
ancestors are skipped. This is ordered navigation, not geometric/spatial search.

Focus suppresses gameplay input. Held controls must return to neutral before
releasing gamepad ownership to gameplay. Navigation advances on the fixed clock,
with a 0.35-second initial repeat delay and 0.1-second repeats; A/B are edge-only.
Pause, blur and detach reset input. Pointer lock keeps gameplay ownership: release
it before a controller-operated menu. Native keyboard/pointer controls remain
available. Browser acceptance simulates standard Gamepad samples; the public
native input tool does not emulate physical gamepads. Real hardware feel is a
separate check. No on-screen keyboard or automatic focus trap is provided.

## Entities and structural changes

`world.findByAuthoredId(id)` resolves captured identity. Handles are frozen,
world-scoped `{world, slot, generation}` values; never persist them. Reuse advances
generation; exhausted uint32 generations quarantine slots. `isAlive` is safe for
stale handles; other operations diagnose stale/foreign/ended worlds. Initial
`entities` and `world.inspect().transform` are metadata, not live dynamic poses.

```js
const ticket = context.world.submit([{
  op: 'create', key: 'crate', name: 'Crate',
  primitive: { shape: { kind: 'box', size: [0.8, 0.8, 0.8] },
    position: [0, 3, 0], velocity: [1, 0, 0], mass: 1, color: '#ffb020' },
}]);
// Poll later; do not await a tick receipt inside create().
const result = ticket.read();
if (result.status === 'committed') context.world.inspect(result.created.crate);
```

Supported creation: logical entities, dynamic box/sphere primitives, supported
imported model leaves and upright kinematic character capsules. Primitive units
are world metres, m/s, kg and XYZ Euler degrees. Captured descriptors are immutable.
Optional collider offsets/sizes and physics filters/materials use public types.
Explicit component lists must include dependencies; invalid batches never partly
publish. parentKey refers only to another create in the same batch. Initial local
transform metadata is not a live hierarchy propagation API.

Configure runtimePhysicsCapacity (0–4,096, default 0) before Play. This reserves GPU
storage even for empty slots; it is not a measured throughput claim. Logical
default capacity is 4,096, host spare capacity at least 1,024 beyond authored count,
absolute maximum 1,000,000. Structural limits: 1–128 commands/batch, 32 component IDs
per creation, 64 batches/256 queued commands, 1–256-character keys/names.

Tickets progress queued/preparing/ready → committed/rejected. One FIFO batch may
commit per fixed tick; async preparation blocks later batches from overtaking.
Pause retains it; Step may start preparation and a later Step publish ready work.
Creates reserve slots before removals become reusable. A full create+destroy batch
can reject despite a fitting net count. No unbounded completed-ticket history.

Backend preparation owns rollback and stale cleanup; publish is synchronous and
reversible. Logical identities commit after successful backend publication.
Failed rollback ends the world. Removed handles stale immediately; slots/resources
retire only after in-flight work. Failed retirement quarantines. Stop rejects
pending tickets, aborts preparation and invalidates all handles. Unchanged bodies
retain resident poses, velocity, force and contact state through sparse edits.

`world.destroy(handle)` queues a captured/runtime subtree. Individual submit
`destroy` requires all children removed in the batch. Limits are 128 affected
entities and 128 physical bodies; static triangles count separately. Partial
compound edits reject. Pool-owned entities must return through their pool.
Authored physical slots remain inactive until Stop, not reusable spawn reserve.
Destruction removes behavior/tag/animation/motor/static-query/presentation owners,
without editing scene files. Stop restores authored content. No synthetic collision
exit is promised. Removing a camera entity does not revoke the runtime camera port.

## Prefabs, models and pools

Create and edit saved assets through `prefab.create/inspect/edit` or manual Prefab
Mode; [the agent contract](./AI_GAME_DEVELOPER.md) defines node IDs, revisions and
runtime-subset diagnostics. The tools preserve the same prefab graph used by the
public JavaScript API below. Saved edits leave current instances and Play captures
unchanged. Runtime registration currently uses project source, with no dedicated
registration tool or UI.

Register saved GUID AssetRefs in braze.project.json.runtimePrefabs. Play captures
saved sources/revisions; unsaved Prefab Mode drafts are excluded. Static builds
embed sources and reachable models/materials/textures/clip/Avatar/mask/import data.
Missing/ambiguous dependencies fail startup/build. Source model bytes still load
lazily; avoid editing source bytes mid-load. A metadata snapshot is not a full
filesystem snapshot.

`context.prefabs.list/instantiate/destroy/isAlive` uses atomic structural tickets.
Placement replaces supplied root transform fields; children remain local. Each
instance has a root handle and saved-node-ID → fresh-handle mapping. No live root
transform/reparent API. Stop invalidates instances; ticket history stays readable.

Supported graph: Transform root/groups, visible dynamic box/sphere leaves,
render-only imported model leaves, supported dynamic model physics, or Character
Controller leaves. Dynamic leaves need enabled Rigidbody, interpolation None and
one enabled box/sphere collider. Character leaves need enabled Kinematic body and
exactly one solid Y capsule, world-upright with equal radial scale. No additional
disabled colliders in that subset. Positive non-sheared transforms are required.
Imported models support GLTF/GLB/FBX/USDZ loading; full character catalog support
is format-dependent (see [characters](./CHARACTER_SYSTEM.md)). Imported instancing,
lines/points and enabled imported cameras/lights reject in runtime models.

Animator/skinning is supported on eligible imported model leaves, not groups or
primitive leaves. Dynamic models require disabled/extractOnly root motion;
character models may apply translation/yaw through their motor, never full tilt.
Nested prefab links, generic kinematic/static physical leaves, joints, hidden
leaves, children under physical/model leaves, runtime material editing and broad
component attachment remain unsupported. Primitive visuals use solid colors;
model surfaces keep supported saved material/texture bindings.

Each instance/view owns mutable materials and leases immutable geometry/textures.
Loading and Animator admission happen before atomic publication. Stale or failed
preparation releases everything. View detach does not destroy world instances.
Pose binding/removal invalidates separate Three shadow-caster shader caches before
pose buffers retire; depth textures and world animation clocks remain owned by
existing services. Resource fences never become frame-loop waits.

Limits: 32 prefab sources, 1–128 nodes/source, 1 MiB/source, 8 MiB catalog;
128 distinct model assets, 256 materials, 1 MiB metadata/prefab, 64 material bindings
per node, 128 model nodes including dormant/retiring, 1–128 meshes and ≤1,000,000
vertices/model, 16 views. Animator's 32-session budget includes authored/prepared/
retiring instances and is not raised by prefabs. See character work limits too.

```js
const source = context.prefabs.list()[0];
const pool = context.prefabs.createPool(source.asset, { capacity: 8 });
const pending = pool.acquire({ position: [0, 3, 0] });
// On a later tick, if committed:
// pool.release(pending.read().instance);
// Once all operations, active leases and retirements finish: pool.dispose();
```

Pools have 1–64 members, at most 32 pools and 4,096 reserved node identities/world.
Population is lazy and initially needs free logical/physical capacity. Successfully
created members retain slots and prepared assets across return. Return invalidates
handles at commit; reacquire waits for GPU retirement and creates new generations.
Reset restores saved placement/defaults, tags, velocity/forces, contact identity,
behaviors, Animator parameters/cursors and motor state. Saved behaviors recreate;
programmatic attachments require reattachment. Dormant models keep assets, not
visible view graphs or running Animators. Old sinks cannot drive new leases.

Exhaustion rejects before enqueueing. Unsafe retirement quarantines; disposal
requires no active/pending/retiring leases, then releases reserves. Stop owns final
cleanup. No prewarming, automatic growth, active reset-in-place or cross-world
sharing. Project state outside the pool remains the project's reset responsibility.

## Tags

One case-sensitive project tag per object, or Untagged; no inheritance. Project
Tags explicitly saves its catalog in project.entityTags. Object assignments use
scene/prefab history. Usage audits distinguish open unsaved data from saved files;
other tabs' unsaved changes are not included. Missing definitions remain visible.
Remove only after complete unused-reference checks; rename/bulk reassignment is open.

Names: letter then letters/digits/_/./-, 1–48 characters, ≤256 definitions; Untagged
is reserved. Runtime queryTag(name, limit) requires 1–256 results and returns
handles/total/truncated from a sparse index, not nearest-object order. setTags
commits through structural commands. Pool return removes membership immediately;
reacquire restores saved tags. Stop discards runtime changes.

## Input assets

Project/Create → Input → Input Action Map creates a .braze-input.json asset with
braze/input-action-map-v1 envelope and a version-1 map. Its sidecar importer is
braze.input-action-map. Inspector edits a draft; Save writes validated complete
bytes and Revert discards. Conflicts retain the draft. Project Input Settings
stores project.input.actionMap as GUID/main and remains usable for missing assets.
Move/rename retain GUID; duplicate changes it; restore heals selected references.
The Project input dropdown saves its selection immediately. **Use for project**
selects the asset currently displayed in the Inspector; it is not an Apply button
for the dropdown. **Clear project input map** explicitly restores module fallback.

Agents use `input.map.create/inspect/save` and `input.project.inspect/select`
through MCP or the JSON CLI. The catalog describes every action/device variant,
default and bound. `create` takes `{document, folder?}`; `inspect` takes
`{assetGuid}`; `save` takes `{assetGuid, baseRevision, document}`. The document
contains `{version: "braze/input-action-map-v1", name, map: {version: 1, actions}}`.
Names in `actions` must be unique. For example, a collect button is
`{name: "collect", kind: "button", bindings: [{device: "keyboard", code: "KeyE"}]}`.
Declare all actions required by attached controls, including movement/look/jump.

All three writes preview unless `apply: true`. Map saves use the SHA-256 source
revision from inspect; selection uses the **input-section** revision returned by
`input.project.inspect`, not the map or scene revision. Select takes
`{assetGuid, baseRevision}`; `assetGuid: null` explicitly restores module fallback.
Only an absent project input section has a null revision. Selection validates the
ready asset and document; inspection reports missing selections so they can be
restored or cleared. Unrelated project sections are preserved.

The shared authoring service is also used by the manual Input Inspector HTTP API.
Saved operations leave open drafts intact; stale saves conflict. Revert reloads a
dirty draft, and reopening/reloading the editor refreshes clean assets/settings.
These disk writes have backups and Save/Revert semantics, not scene undo/redo.
The runtime script port remains `context.input.action(name)`, `bindings()` and
`rebind(name, bindings)`; it never writes authored files.

Play captures saved input bytes/revision before startup, excluding unsaved drafts.
Selected map wins over GameModule.input; with neither, stock starter actions are
provided. Invalid selection fails Play/export without silent fallback. A valid
empty map may still fail a behavior's required-action validation. rebind is
session-local; no implicit asset or player-preference write. Export embeds saved input.

Limits: 64 actions, 8 bindings/action, 4 pads, 32 pad buttons, 8 axes, 256 KiB source,
128-character asset names. Kinds are button, axis and delta; bindings cover keyboard,
pointer buttons/deltas and gamepad buttons/axes. Input belongs to the active Game
surface; text fields, blur, hidden tabs, Pause and Stop release it. Edges/pointer
deltas are consumed once per admitted fixed tick. Native pointer lock needs a
real user gesture; report requesting/locked/rejected honestly.

## Stock controls and character commands

Saved v1 IDs: braze.control.first-person, braze.control.third-person and
braze.control.top-down. Add them in Behaviors on a valid Character Controller.
Each performs orientation → motor → camera in one admitted tick. FPS faces view;
TPS/top-down face movement. cameraEnabled=false supplies movement only. One
camera writer; each character has its own exclusive movement owner.

Use character controls preset in the Input Inspector, then Save and select it.
createStockControlInputMap supplies the same script map: moveX/moveZ axis (WASD /
left stick), jump button, lookX/lookY pointer pixel deltas, lookRateX/lookRateY
axis rates. All seven names are required, configurable fields. Normalize XZ;
yaw zero faces +Z, positive toward +X; positive pitch looks down. Pointer sensitivity
is degrees/pixel without dt; gamepad speed is degrees/second with dt.

Defaults: speed 4 m/s, gravity 9.81 m/s², jumpSpeed 5 m/s, mouse sensitivity 0.12,
gamepad look 120°/s, yaw offset 0, pivot height 0.6 m, FOV 60°, sharpness 12/s.
FPS pitch 0° with ±85° bounds; TPS 20° [-70,80], distance 4 m; top-down 60° [20,85],
distance 8 m. TPS/top-down shoulder 0, collision radius 0.2 m. FPS exposes 20 fields,
others 23. Configure eye height for the model: the default can be inside a box;
there is no automatic self-hiding. Top-down does not imply navigation/click-to-move.

characters.snapshot returns a frozen static-scope last-command position/yaw/
grounded result, null before readiness, errors on stale/foreign/ended handles.
characters.acquire grants snapshot/move/release; move may atomically set absolute
yawDegrees. Direct move works only unclaimed, during fixed ticks, within the shared
128-command/tick budget. Applied Animator root motion and a script lease cannot
own the same motor. Camera acquire similarly grants setPose/snapshot/release;
release restores authored camera. Observer snapshots confer no writing authority.

Stock policies acquire on enable, release on disable/dispose and reset state on
re-enable. FPS/TPS camera controls request capture on Game clicks; top-down and
movement-only do not. TPS/top-down camera.constrain uses static sphere sweeps;
dynamic props do not obstruct it. Early admission failure releases prior leases.

createFirstPersonControl/createThirdPersonControl/createTopDownControl accept
injected ports and immutable options. createCharacterControlPolicy accepts custom
camera/facing; look, locomotion and camera factories can be used separately. They
have no private clocks or DOM ownership. Disable a saved owner and wait for its
boundary before acquiring a replacement. Extend stock systems with a distinct
registered ID instead of overriding engine definitions.

Runtime character descriptors supply world position/yaw, one solid Y capsule,
movement/physics settings and either a box/sphere render or matching imported
model. Capsule halfLength is half authored length; dimensions are already world-
scaled and center follows object yaw. No mass, gravity, velocity, trigger or tilt.
The policy supplies gravity/jump; the motor supplies static sliding/slopes/steps/
snap/overlap recovery. Moving platforms and dynamic sensing remain open.

## Animation commands

World-owned Animator state survives view changes and has one event/root-motion
cursor per actor. Views are clockless. context.animation addresses live handles:
snapshot, setFloat/setInt/setBool/setTrigger/resetTrigger and subscribe. Parameter
keys are stable IDs, not labels. Snapshots are frozen, null when absent/loading.
Subscriptions end with the session and return an early unsubscribe function.
Normal/Unscaled advance in shared simulation; Fixed Step follows admitted physics.
Pause freezes every mode; Step advances once; no views suspends without disposal.

Runtime model preparation reserves sessions before publication. Pool return ends
them, reacquire restores captured defaults. Translation/yaw root motion uses an
explicit handle-owned kinematic motor; dynamic applyToObject and character full
rotation reject. Disabled/extractOnly can coexist with script locomotion.
Detailed blending, rigging, limits and IK: [CHARACTER_SYSTEM.md](./CHARACTER_SYSTEM.md).

## Verification and remaining work

Run the relevant gameplay/behavior/input/model/animation/character/control browser
fixtures in editor and static player, plus lifetime/soak tests. Public code must
also pass project type/JSDoc checks; transpilation is insufficient. Agent acceptance
must create a real project using these contracts; see the mandatory agent guide.
Remaining work includes richer script asset/Inspector workflows, data behavior
graphs, arbitrary component extensions, audio services, dynamic queries,
scene transitions and gameplay saves. Never infer support from this roadmap.
