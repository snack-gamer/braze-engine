import { rewritePlayerAssetUrls } from "./player-package-compiler.mjs";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadProjectRuntimePrefabs, RUNTIME_PREFAB_ENDPOINT } from "./project-runtime-prefabs.mjs";
import { loadProjectInputActionMap, PROJECT_INPUT_ENDPOINT } from "./project-input-action-map.mjs";
import { readProjectEntityTags } from "./project-entity-tags.mjs";

const MODULE_ID = "virtual:braze-game-module";
const RESOLVED_ID = `\0${MODULE_ID}`;
const PUBLIC_GAME_API = fileURLToPath(new URL("../../src/gameplay/public.ts", import.meta.url));

export function readRuntimePhysicsCapacity(projectRoot) {
  const file = path.join(projectRoot, "braze.project.json");
  if (!existsSync(file)) return 0;
  const config = JSON.parse(readFileSync(file, "utf8")), value = config.runtimePhysicsCapacity ?? 0;
  if (!Number.isInteger(value) || value < 0 || value > 4096) {
    throw new Error("runtimePhysicsCapacity must be 0–4096.");
  }
  return value;
}

function within(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/** Build-time trusted code, separate from asset imports and scene/automation JSON. */
export function resolveProjectGameEntry(projectRoot) {
  const configFile = path.join(projectRoot, "braze.project.json");
  if (!existsSync(configFile)) return null;
  const config = JSON.parse(readFileSync(configFile, "utf8"));
  if (config.gameplayEntry === undefined) return null;
  const entry = config.gameplayEntry;
  if (typeof entry !== "string" || !entry || !/\.(?:ts|tsx|js|jsx)$/.test(entry) || entry.endsWith(".d.ts")
    || entry.includes("\\") || entry.includes("\0") || path.isAbsolute(entry) || /^[a-z]:/i.test(entry)) {
    throw new Error("gameplayEntry must be a relative TypeScript/JavaScript module path inside the project.");
  }
  const absolute = path.resolve(projectRoot, entry);
  if (!within(path.resolve(projectRoot), absolute) || !existsSync(absolute) || !statSync(absolute).isFile()
    || !within(realpathSync(projectRoot), realpathSync(absolute))) {
    throw new Error(`Missing or escaping gameplayEntry: ${entry}`);
  }
  return realpathSync(absolute);
}

export function createProjectGameModulePlugin(projectRoot) {
  const entry = resolveProjectGameEntry(projectRoot);
  const capacity = readRuntimePhysicsCapacity(projectRoot);
  let build = false;
  return {
    name: "braze-project-game-module",
    configResolved(config) { build = config.command === "build"; },
    resolveId(id) {
      if (id === "@braze/game") return PUBLIC_GAME_API;
      if (id === MODULE_ID) return RESOLVED_ID;
    },
    load(id) {
      if (id !== RESOLVED_ID) return;
      if (entry && build) this.addWatchFile(entry);
      const entryId = JSON.stringify(entry?.replaceAll(path.sep, "/"));
      const loader = entry ? `return (await import(${entryId})).default;` : "return null;";
      // Accept project dependencies here, before HMR can retire editor providers or
      // runtime owners. Existing Play closures stay alive; only future loads change.
      const hot = entry && !build ? `let replacement; let updated = false;
if (import.meta.hot) import.meta.hot.accept(${entryId}, (module) => {
  if (module) { replacement = module.default; updated = true; }
});` : "";
      const module = `${hot}\nexport const runtimePhysicsCapacity = ${capacity}; export const hasGameModule = ${Boolean(entry)}; export async function loadGameModule() { ${hot ? "if (updated) return replacement;" : ""} ${loader} }`;
      if (build) return Promise.all([loadProjectRuntimePrefabs(projectRoot), loadProjectInputActionMap(projectRoot)]).then(([sources, input]) => `${module}\nexport async function loadRuntimePrefabs() { return ${JSON.stringify(rewritePlayerAssetUrls(sources))}; }\nexport async function loadEntityTagCatalog() { return ${JSON.stringify(readProjectEntityTags(projectRoot))}; }\nexport async function loadProjectInput() { return ${JSON.stringify(input)}; }`);
      return `${module}\nexport async function loadRuntimePrefabs(signal) { const response = await fetch(${JSON.stringify(RUNTIME_PREFAB_ENDPOINT)}, { signal, cache: "no-store" }); if (!response.ok) throw new Error(await response.text()); return response.json(); }\nexport async function loadEntityTagCatalog(signal) { const response = await fetch('/api/project', { signal, cache: 'no-store' }); if (!response.ok) throw new Error('Could not load Project Tags'); return (await response.json()).project.entityTags; }\nexport async function loadProjectInput(signal) { const response = await fetch(${JSON.stringify(PROJECT_INPUT_ENDPOINT)}, {signal, cache: 'no-store'}); if (!response.ok) throw new Error(await response.text()); return (await response.json()).input; }`;
    },
    configureServer(server) {
      // The configured source tree may be outside the engine checkout.
      server.config.server.fs.allow.push(path.resolve(projectRoot));
      server.middlewares.use(PROJECT_INPUT_ENDPOINT, async (req, res) => {
        if (req.method !== "GET") { res.statusCode = 405; res.end(); return; }
        res.setHeader("Cache-Control", "no-store"); res.setHeader("Content-Type", "application/json");
        try { res.end(JSON.stringify({ input: await loadProjectInputActionMap(projectRoot) })); }
        catch (error) { res.statusCode = 400; res.end(JSON.stringify({ error: String(error) })); }
      });
      server.middlewares.use(RUNTIME_PREFAB_ENDPOINT, async (req, res) => {
        if (req.method !== "GET") { res.statusCode = 405; res.end(); return; }
        res.setHeader("Cache-Control", "no-store"); res.setHeader("Content-Type", "application/json");
        try { res.end(JSON.stringify(await loadProjectRuntimePrefabs(projectRoot))); }
        catch (error) { res.statusCode = 400; res.end(JSON.stringify({ error: String(error) })); }
      });
    },
  };
}
