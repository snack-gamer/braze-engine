import { boolean, enumeration, identifier, layer, mask, nonnegative, number, object, sceneCommandSchema, vector, type JsonSchema } from "./command-schemas";
import { uiNodeSchema } from "../../game-ui/domain/ui-schema";
import { animatorSchemaDefinitions } from "../../character/domain/animator-authoring-schema";
import { browserStepsSchema } from "./playtest-schemas";
import { inputMapDocumentSchema, inputAssetGuidSchema, inputRevisionSchema, inputFolderSchema } from "../../input/domain/input-authoring-schema";
import { SOURCE_IMPORT_EXTENSIONS, SOURCE_IMPORT_MAX_BYTES } from "../../assets/domain/source-import-contract.mjs";

export type AutomationOperation = Readonly<{ operation: string; description: string; inputSchema: JsonSchema;
  annotations: { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean; openWorldHint: boolean } }>;
const sceneId = { type: "string", pattern: "^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$", description: "Scene document ID; saved operations default to current." };
const sessionId = { ...identifier, description: "One explicit connected tab from editor.sessions; never choose a tab implicitly." };
const context = { sessionId, sceneId, sceneInstanceId: { type: "integer", minimum: 0, description: "Lifetime guard from editor.inspect/status." } };
const pagination = { offset: { type: "integer", minimum: 0, default: 0 }, limit: { type: "integer", minimum: 1, maximum: 200, default: 100 } };
const edits = { commands: { type: "array", minItems: 1, maxItems: 2048, items: sceneCommandSchema },
  apply: { ...boolean, default: false, description: "Omit/false to preview; true applies the atomic batch after a successful preview." } };
const prefabGuid = { ...inputAssetGuidSchema, description: "Stable prefab GUID from assets.list or an applied prefab.create." };
const prefabRevision = { ...inputRevisionSchema, description: "Saved source SHA-256 revision from prefab.inspect; never a live scene revision." };
const editHelp = " Behaviors, uiCanvas and animator replace their whole documents; preserve unrelated entries. Animator requires an indexed FBX/glTF main model and an embedded controller; discover clip/avatar AssetRefs with assets.list. Asset dependency readiness and playback still require Play/export checks. UI uses responsive screen-space node trees; script named actions through context.ui. Physics values merge. Invalid batches never partly apply.";
type Access = "read" | "write" | "presentation";
function operation(name: string, description: string, properties: Record<string, JsonSchema>, required: string[] = [], access: Access = "read"): AutomationOperation {
  return { operation: name, description, inputSchema: object({ ...properties,
    requestId: { ...identifier, description: "Optional correlation ID. Omit to generate one. Not an idempotency key." } }, required),
    annotations: { readOnlyHint: access === "read", destructiveHint: access === "write", idempotentHint: access === "read", openWorldHint: false } };
}
const live = (name: string, description: string, properties: Record<string, JsonSchema> = {}, required: string[] = [], access: Access = "read") =>
  operation(name, description, { ...context, ...properties }, ["sessionId", ...required], access);
const workspace = (name: string, description: string, properties: Record<string, JsonSchema> = {}, required: string[] = [], access: Access = "write") =>
  operation(name, description, { sessionId, ...properties }, ["sessionId", ...required], access);
const name = { type: "string", minLength: 1, maxLength: 128, pattern: "^[^\\u0000-\\u001f]+$" };
const conditional = (entry: AutomationOperation, requirements: [string, string[]][]): AutomationOperation => ({ ...entry,
  inputSchema: { ...entry.inputSchema, allOf: requirements.map(([kind, required]) => ({ if: { properties: { kind: { const: kind } } }, then: { required } })) } });
const requiresOnApply = (entry: AutomationOperation, required: string[]): AutomationOperation => ({ ...entry,
  inputSchema: { ...entry.inputSchema, allOf: [{ if: { required: ["apply"], properties: { apply: { const: true } } }, then: { required } }] } });

/** The HTTP catalog and MCP tools share these operation descriptions, names and schemas. */
export const automationOperationCatalog: readonly AutomationOperation[] = [
  operation("browser.inspect", "Discover editor sessions in the existing dedicated Chromium browser (engine-browser.mjs open, default CDP 9339). No browser/tab is created or closed.", {}),
  operation("browser.capture", "Capture the Game view (default) or whole editor as a PNG. Requires an explicit browser.inspect sessionId and visible view <=4096 CSS pixels per side. MCP returns image content; HTTP returns base64. No implicit tab selection.", { sessionId, area: enumeration("game", "editor") }, ["sessionId"]),
  operation("browser.input", "Exercise native Game input in one explicit dedicated-browser session. Play and inspect readiness first. 1–32 steps, <=5 seconds declared duration; key hold <=2 seconds. Focus Game/UI before keys. UI targets come from editor.ui; actions deliver next fixed tick. Partial failure/cancellation reports no replay; inspect before retry. May foreground the dedicated browser.", { sessionId, steps: browserStepsSchema }, ["sessionId", "steps"], "write"),
  operation("project.export.start", "Build a saved scene into a new isolated temporary static-player directory using the shared compiler and budget checks. Requires saved byte-hash revision; save live edits first. Returns jobId immediately. One active job, 16 receipts, 3-minute deadline. Project scripts/assets must remain unchanged during build; this is not a project snapshot. Does not publish or typecheck project scripts.", { sceneId, baseRevision: identifier }, ["baseRevision"], "write"),
  operation("project.export.status", "Read a server-local export job, bounded log, output directory and terminal status. Successful output remains for the caller; receipt is lost on server restart.", { jobId: identifier }, ["jobId"]),
  operation("project.export.cancel", "Cancel one export and wait for its process to exit. Removes that job's unfinished temporary output. Successful output is retained. No command replay.", { jobId: identifier }, ["jobId"], "write"),
  operation("scene.list", "List saved scene documents. Paginate until nextOffset is null.", pagination),
  operation("scene.inspect", "Inspect a saved scene and its byte-hash revision. Does not include an editor tab's unsaved edits.", { sceneId, ...pagination }),
  operation("scene.validate", "Validate saved physics/component authoring; returns diagnostics. Does not start Play.", { sceneId }),
  operation("scene.edit", "Preview/apply saved scene edits with a byte-hash revision; use editor.edit for an open tab. null is only for a new scene." + editHelp,
    { sceneId, baseRevision: { type: ["string", "null"] }, ...edits }, ["baseRevision", "commands"], "write"),
  operation("assets.list", "Discover stable AssetRefs and source/subasset records. Query matches source path. Paginate large catalogs.", { ...pagination, query: { type: "string" } }),
  operation("prefab.create", "Preview/create a saved prefab asset (max 1 MiB). Starts with a Transform master root whose node ID is root; parent new nodes beneath it. Uses scene object/component commands and stable explicit node IDs. Preview proposes a filename without reserving it; apply creates a fresh GUID, never overwrites. Inspect after a lost receipt. Reload Project after writes. Runtime subset diagnostics do not verify dependencies or register the prefab for Play." + editHelp,
    { name: { type: "string", minLength: 1, maxLength: 256 }, folder: inputFolderSchema, ...edits }, ["name", "commands"], "write"),
  operation("prefab.inspect", "Inspect a saved prefab by GUID (max 1 MiB), its source hash, master root, paginated authored nodes and runtime subset diagnostics. Resolves moves/renames. Does not include an open Prefab Mode draft or verify dependency readiness.",
    { assetGuid: prefabGuid, ...pagination }, ["assetGuid"]),
  operation("prefab.edit", "Preview/apply saved prefab commands using its inspected source hash. Preserves GUID and node IDs through the same queued store/backups as manual Prefab Mode. Open drafts, scene instances and scene undo remain unchanged; stale manual saves conflict. Reopen Prefab Mode after external writes. Runtime catalogs capture saved changes on next Play/export; declare GUIDs in project runtimePrefabs. Nested prefabs/variants and live instance overrides are unsupported." + editHelp,
    { assetGuid: prefabGuid, baseRevision: prefabRevision, ...edits }, ["assetGuid", "baseRevision", "commands"], "write"),
  requiresOnApply(operation("assets.import", "Preview/import one local source file into Assets. Paths refer to the engine host, not the MCP client. Preview hashes bytes without writing; apply requires that sourceRevision and a new exact destination. Never overwrites a source or metadata. Import external model dependencies first with their relative paths intact, one file per call; bundles are not atomic. Returns stable AssetRef and index diagnostics; verify browser rendering separately. Reload Project after external imports. After a lost receipt inspect assets.list before retrying. No URLs, scripts, metadata or replacement/reimport.",
    { sourcePath: { type: "string", minLength: 1, maxLength: 4096, description: `Absolute local regular file; max ${SOURCE_IMPORT_MAX_BYTES} bytes. Supported extensions: ${SOURCE_IMPORT_EXTENSIONS.join(", ")}.` },
      destination: { type: "string", minLength: 1, maxLength: 1024, description: "Exact Assets-relative file path including matching extension; no hidden segments, traversal, backslashes, URLs or .meta sidecars." },
      sourceRevision: { type: "string", pattern: "^[a-f0-9]{64}$", description: "SHA-256 returned by preview; required when apply is true. Changed bytes fail with conflict before publication." },
      apply: { ...boolean, default: false, description: "Omit/false to preview; true imports the previously hashed source into a new destination." } }, ["sourcePath", "destination"], "write"), ["sourceRevision"]),
  operation("input.map.create", "Preview/create a saved Input Action Map through the same owner as Project/Create. Document uses unique action names; pointer motion requires delta actions. Preview returns a proposed filename without reserving it; apply allocates a fresh asset/GUID, never overwrites. Inspect after an uncertain receipt before retrying. Reload Project to see external changes; does not select the map.",
    { document: inputMapDocumentSchema, folder: inputFolderSchema, apply: edits.apply }, ["document"], "write"),
  operation("input.map.inspect", "Read a saved Input Action Map by stable GUID and its byte-hash revision. Resolves moves/renames; rejects missing, ambiguous or wrong-type assets. Does not include an Inspector's unsaved draft.", { assetGuid: inputAssetGuidSchema }, ["assetGuid"]),
  operation("input.map.save", "Preview/save the complete Input Action Map document by GUID with its inspected byte-hash revision. Preserves identity, queues writes and backs up the previous source. Does not edit an open Inspector draft or scene undo history; a stale manual Save conflicts. The running Play snapshot is unchanged; saved changes apply next Play/export.",
    { assetGuid: inputAssetGuidSchema, baseRevision: inputRevisionSchema, document: inputMapDocumentSchema, apply: edits.apply }, ["assetGuid", "baseRevision", "document"], "write"),
  operation("input.project.inspect", "Read the saved project input selection, its input-section hash revision (null if absent), selected asset and any missing/invalid-source problem. Use this revision for input.project.select; unrelated project sections have separate revisions.", {}),
  operation("input.project.select", "Preview/select a saved ready Input Action Map by GUID, or explicitly clear with assetGuid:null to use the game module fallback. Requires the input-section revision from input.project.inspect. Saves only that section through the project owner. Reload open Project Input Settings after external changes. Next Play/export captures the selection; current Play is unchanged. No runtime profile switching or persisted player rebinding.",
    { assetGuid: { anyOf: [inputAssetGuidSchema, { type: "null" }] }, baseRevision: { anyOf: [{ ...inputRevisionSchema, description: "Input-section SHA-256 revision from input.project.inspect; null only when that section is absent." }, { type: "null" }] }, apply: edits.apply }, ["assetGuid", "baseRevision"], "write"),
  operation("editor.sessions", "List connected editor tabs. Select one intended session explicitly before live operations.", {}),
  live("editor.status", "Inspect loading, mode, revision, scene identity and physics readiness. Play success alone does not prove readiness."),
  live("editor.behaviors", "Discover stock/project stable behavior IDs, versions, fields, defaults and bounds from the Inspector registry. Does not create a Play world."),
  live("editor.ui", "Inspect running screen-space UI: screen IDs, current node text/values/styles, active tween count, focused node and up to 200 image/font resource states in presentation (null without an active Game view). Requires ready Play. Optionally select screenId and paginate its nodes. This is runtime state, not saved authoring or a screenshot.", { screenId: identifier, ...pagination }),
  live("editor.inspect", "Inspect live authored objects, status and numeric revision. Paginate by objectCount; runtime GPU poses are not authored transforms.", pagination),
  live("editor.validate", "Validate live authored physics/components without mutating or playing."),
  live("editor.edit", "Preview/apply an atomic live Edit Mode batch. Inspect numeric revision and sceneInstanceId first. One batch is one undo entry; save separately." + editHelp,
    { baseRevision: { type: "integer", minimum: 0 }, ...edits }, ["baseRevision", "commands"], "write"),
  live("editor.save", "Save the active scene through the editor persistence owner. Requires Edit Mode; conflicts fail explicitly.", {}, [], "write"),
  live("editor.transport", "Play, pause, step one fixed tick, or stop/restores authored state. Inspect readiness after Play; commands are not replayed.",
    { action: enumeration("play", "pause", "step", "stop") }, ["action"], "write"),
  live("editor.select", "Select an existing scene object in Hierarchy/Inspector.", { objectId: identifier }, ["objectId"], "presentation"),
  live("editor.camera", "Set the editor Scene camera position/target in world metres. This does not change an authored game camera.",
    { position: vector, target: vector }, ["position", "target"], "presentation"),
  live("editor.undo", "Undo one live authored edit in Edit Mode.", {}, [], "write"),
  live("editor.redo", "Redo one live authored edit in Edit Mode.", {}, [], "write"),
  conditional(live("editor.physics", "Queue a command in a running physics world. impulse accumulates, velocity replaces, force persists (zero clears). Paused worlds need Step. character-move constrains against static geometry; caller owns gravity/jump.",
    { objectId: identifier, kind: enumeration("impulse", "velocity", "force", "kinematic-target", "character-move"),
      linear: vector, angular: vector, position: vector, orientation: { type: "array", items: number, minItems: 4, maxItems: 4, description: "Quaternion x,y,z,w." }, displacement: vector },
    ["objectId", "kind"], "write"), [["impulse", ["linear"]], ["velocity", ["linear"]], ["force", ["linear"]], ["kinematic-target", ["position", "orientation"]], ["character-move", ["displacement"]]]),
  conditional(live("editor.query", "Query authored static geometry only; never reports moving GPU bodies. Direction is normalized by the query owner. Distances/radius/halfSegment are metres.",
    { scope: { const: "static" }, kind: enumeration("raycast", "sphere-cast", "capsule-cast"), origin: vector, direction: vector,
      maxDistance: nonnegative, radius: nonnegative, halfSegment: vector, includeTriggers: boolean, collisionLayer: layer, collisionMask: mask, excludeObjectId: identifier },
    ["scope", "kind", "origin", "direction", "maxDistance"]), [["capsule-cast", ["radius", "halfSegment"]]]),
  live("editor.events", "Drain bounded collision/trigger transitions from a running world. Consumes events; inspect overflow. No full pose readback.", {}, [], "write"),
  live("editor.mesh", "Capture object-local static triangles in Edit Mode for explicit collider baking. Requires a ready physics presentation.", { objectId: identifier }, ["objectId"]),
  workspace("editor.scene.list", "List saved scene catalog and active scene identity. Catalog byte-hash revisions are used for deletion.", {}, [], "read"),
  workspace("editor.scene.create", "Immediately create and open a new scene; saves the source first. Requires Edit Mode; poll loaded afterward.", { name, template: { ...enumeration("basic", "empty"), default: "basic" } }, ["name"]),
  workspace("editor.scene.open", "Open a saved scene; saves the source first. Conflicts block switching. Poll status/loaded and inspect a fresh revision.", { sceneId, mode: enumeration("single") }, ["sceneId"]),
  workspace("editor.scene.copy", "Save the current scene, copy it under a fresh ID/name, and open the copy immediately.", { name }, ["name"]),
  workspace("editor.scene.rename", "Rename and save the active scene without changing its stable scene ID.", { name }, ["name"]),
  workspace("editor.scene.delete", "Move a saved scene to recoverable Trash using its catalog revision. Active-scene deletion switches to a valid fallback.",
    { sceneId, baseRevision: { ...identifier, description: "Saved byte-hash revision from editor.scene.list, not numeric live revision." } }, ["sceneId", "baseRevision"]),
].map((entry) => entry.operation.endsWith(".edit") || entry.operation === "prefab.create" ? { ...entry, inputSchema: { ...entry.inputSchema, $defs: { uiNode: uiNodeSchema, ...animatorSchemaDefinitions } } } : entry);
