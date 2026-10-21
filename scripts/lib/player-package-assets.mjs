import { playerModelDependencyUris } from "./player-model-dependencies.mjs";
import { existsSync } from "node:fs";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import {
  ASSETS_ROOT,
  ENGINE_ASSETS_ROOT,
  HDRI_ROOT,
  LIBRARY_ROOT,
  PROJECT_FILE,
  PROJECT_ROOT,
  SCENES_ROOT,
} from "../../server/lib/paths.mjs";
import { listAssets } from "../../server/lib/assets/library-asset-records.mjs";
import { compilePlayerContent } from "./player-package-compiler.mjs";
import { loadProjectRuntimePrefabs } from "./project-runtime-prefabs.mjs";
import { readRuntimePhysicsCapacity } from "./project-game-module.mjs";

import { readProjectUiAssets } from "./player-ui-assets.mjs";

const PLAYER_CONTENT_FILE = "player-content.json";

async function readJson(filename, label) {
  let source;
  try {
    source = await readFile(filename, "utf8");
  } catch (error) {
    throw new Error(`Could not read ${label} at ${filename}: ${error.message}`);
  }
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

export function normalizePlayerRelativePath(value, label) {
  const portable = typeof value === "string" ? value.replace(/\\/g, "/") : "";
  const driveQualified = /^[a-z]:/i.test(portable);
  const uriQualified = /^[a-z][a-z0-9+.-]*:/i.test(portable);
  if (!portable || portable.includes("\0") || portable.startsWith("/")
      || driveQualified || uriQualified
      || portable.split("/").some((part) => part === "..")) {
    throw new Error(`Invalid ${label} path ${JSON.stringify(value)}.`);
  }
  const normalized = path.posix.normalize(portable);
  if (normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`Invalid ${label} path ${JSON.stringify(value)}.`);
  }
  return normalized;
}

export function assertResolvedPathWithinRoot(root, candidate, label, pathApi = path) {
  const resolvedRoot = pathApi.resolve(root);
  const resolvedCandidate = pathApi.resolve(candidate);
  const relative = pathApi.relative(resolvedRoot, resolvedCandidate);
  if (relative === ".." || relative.startsWith(`..${pathApi.sep}`) || pathApi.isAbsolute(relative)) {
    throw new Error(`${label} must stay inside ${resolvedRoot}.`);
  }
  return resolvedCandidate;
}

function resolvePlayerSource(root, relativePath, label) {
  const relative = normalizePlayerRelativePath(relativePath, label);
  return assertResolvedPathWithinRoot(root, path.resolve(root, relative), label);
}

function decodePublicPath(value, prefix) {
  const pathname = value.slice(prefix.length).split(/[?#]/, 1)[0];
  try {
    return normalizePlayerRelativePath(decodeURIComponent(pathname), prefix.slice(1, -1));
  } catch (error) {
    throw new Error(`Invalid player asset URL ${JSON.stringify(value)}: ${error.message}`);
  }
}

function resolvePublicAsset(url) {
  if (url.startsWith("/3d-models/")) {
    const relative = decodePublicPath(url, "/3d-models/");
    const projectSource = resolvePlayerSource(ASSETS_ROOT, relative, "model asset");
    const engineSource = resolvePlayerSource(ENGINE_ASSETS_ROOT, relative, "engine model asset");
    const source = existsSync(projectSource) ? projectSource : engineSource;
    const sourceRoot = source === projectSource ? ASSETS_ROOT : ENGINE_ASSETS_ROOT;
    if (!existsSync(source)) throw new Error(`Referenced model asset is missing: ${relative}`);
    return { source, sourceRoot, fileName: path.posix.join("3d-models", relative) };
  }
  if (url.startsWith("/hdri/")) {
    const relative = decodePublicPath(url, "/hdri/");
    const source = resolvePlayerSource(HDRI_ROOT, relative, "HDRI asset");
    if (!existsSync(source)) throw new Error(`Referenced HDRI asset is missing: ${relative}`);
    return { source, sourceRoot: HDRI_ROOT, fileName: path.posix.join("hdri", relative) };
  }
  throw new Error(`Unsupported player asset URL: ${url}`);
}

function isEmbeddedUri(value) {
  return /^(?:data:|blob:|https?:|\/)/i.test(value);
}

async function modelDependencies(artifact) {
  const uris = (await playerModelDependencyUris(artifact.source)).filter((uri) => !isEmbeddedUri(uri));
  return uris.map((uri) => {
    let decoded;
    try {
      decoded = decodeURIComponent(uri.split(/[?#]/, 1)[0]).replace(/\\/g, "/");
    } catch (error) {
      throw new Error(`Invalid Model dependency ${JSON.stringify(uri)}: ${error.message}`);
    }
    if (!decoded || path.posix.isAbsolute(decoded) || /^[a-z][a-z0-9+.-]*:/i.test(decoded)) {
      throw new Error(`Invalid Model dependency path ${JSON.stringify(uri)}.`);
    }
    const source = assertResolvedPathWithinRoot(
      artifact.sourceRoot,
      path.resolve(path.dirname(artifact.source), decoded),
      `Model dependency ${JSON.stringify(uri)}`,
    );
    const relativeToRoot = path.relative(artifact.sourceRoot, source);
    if (!existsSync(source)) {
      throw new Error(`Missing or escaping Model dependency ${JSON.stringify(uri)} in ${artifact.source}.`);
    }
    return {
      source,
      fileName: path.posix.join("3d-models", relativeToRoot.replace(/\\/g, "/")),
      sourceRoot: artifact.sourceRoot,
    };
  });
}

async function collectArtifacts(urls) {
  const artifacts = new Map();
  for (const url of urls) {
    const artifact = resolvePublicAsset(url);
    artifacts.set(artifact.fileName, artifact);
    for (const dependency of await modelDependencies(artifact)) {
      artifacts.set(dependency.fileName, dependency);
    }
  }
  return [...artifacts.values()].sort((left, right) => left.fileName.localeCompare(right.fileName));
}

function sceneIdFromEnvironment() {
  const sceneId = process.env.BRAZE_PLAYER_SCENE_ID?.trim() || "current";
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(sceneId)) {
    throw new Error("BRAZE_PLAYER_SCENE_ID must contain only letters, numbers, dots, underscores, or dashes.");
  }
  return sceneId;
}

export async function createPlayerBuildPackage() {
  const sceneId = sceneIdFromEnvironment();
  const sceneFilename = path.join(SCENES_ROOT, `${sceneId}.scene.json`);
  const [scene, project, assets] = await Promise.all([
    readJson(sceneFilename, `scene '${sceneId}'`),
    readJson(PROJECT_FILE, "project document"),
    listAssets(),
  ]);
  const index = await readJson(path.join(LIBRARY_ROOT, "asset-index.json"), "asset index");
  const compiled = compilePlayerContent({
    sceneId, uiAssets: await readProjectUiAssets(PROJECT_ROOT),
    runtimePrefabs: await loadProjectRuntimePrefabs(PROJECT_ROOT),
    scene,
    project,
    assets,
    indexRecords: Array.isArray(index.records) ? index.records : [],
    runtimePhysicsCapacity: readRuntimePhysicsCapacity(PROJECT_ROOT),
  });
  return {
    content: compiled.content,
    artifacts: await collectArtifacts(compiled.publicAssetUrls),
  };
}

async function loadPlayerArtifact(artifact) {
  const fileName = normalizePlayerRelativePath(artifact.fileName, "player artifact");
  const lexicalSource = assertResolvedPathWithinRoot(
    artifact.sourceRoot,
    artifact.source,
    `Player artifact ${JSON.stringify(fileName)}`,
  );
  const [canonicalRoot, canonicalSource] = await Promise.all([
    realpath(artifact.sourceRoot),
    realpath(lexicalSource),
  ]);
  const source = assertResolvedPathWithinRoot(
    canonicalRoot,
    canonicalSource,
    `Player artifact ${JSON.stringify(fileName)}`,
  );
  return { fileName, source: await readFile(source) };
}

export function createPlayerPackagePlugin(preparedPackage = null) {
  return {
    name: "braze-player-package",
    apply: "build",
    async buildStart() {
      const playerPackage = preparedPackage ?? await createPlayerBuildPackage();
      const artifacts = await Promise.all(playerPackage.artifacts.map(loadPlayerArtifact));
      this.emitFile({
        type: "asset",
        fileName: PLAYER_CONTENT_FILE,
        source: JSON.stringify(playerPackage.content),
      });
      for (const artifact of artifacts) {
        this.emitFile({
          type: "asset",
          fileName: artifact.fileName,
          source: artifact.source,
        });
      }
    },
  };
}
