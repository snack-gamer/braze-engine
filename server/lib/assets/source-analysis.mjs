import { inputActionMapArtifacts } from "./input-action-map-source.mjs";
import { parseGlbDocument } from "./gltf-source-document.mjs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { displayNameForSource } from "./asset-classification.mjs";
import { assetDiagnostic } from "./asset-diagnostics.mjs";
import { fbxSourceArtifacts } from "./fbx-source-artifacts.mjs";
import { parseFbxSource } from "./fbx-source-loader.mjs";
import {
  gltfDependencies,
  gltfSourceArtifacts,
  prefabArtifacts,
} from "./source-artifacts.mjs";


export async function analyzeAssetSource(sourceFilename, sourcePath, classification) {
  const lower = sourcePath.toLowerCase();
  try {
    if (classification.kind === "inputActionMap") return await inputActionMapArtifacts(sourceFilename);
    if (classification.kind === "prefab") {
      return prefabArtifacts(
        JSON.parse(await readFile(sourceFilename, "utf8")),
        displayNameForSource(sourcePath),
      );
    }
    if (classification.kind === "model" && (lower.endsWith(".glb") || lower.endsWith(".gltf"))) {
      const document = lower.endsWith(".glb")
        ? parseGlbDocument(await readFile(sourceFilename))
        : JSON.parse(await readFile(sourceFilename, "utf8"));
      if (!document
          || typeof document !== "object"
          || !String(document.asset?.version || "").startsWith("2")) {
        throw new Error("glTF asset.version must be 2.x");
      }
      const artifacts = gltfSourceArtifacts(document, displayNameForSource(sourcePath));
      return {
        dependencies: gltfDependencies(document),
        subAssets: artifacts.subAssets,
        diagnostics: artifacts.diagnostics,
      };
    }
    if (classification.kind === "model" && lower.endsWith(".fbx")) {
      const source = await readFile(sourceFilename);
      return fbxSourceArtifacts(parseFbxSource(source), displayNameForSource(sourcePath));
    }
    return { dependencies: [], subAssets: [], diagnostics: [] };
  } catch (error) {
    const prefab = classification.kind === "prefab";
    return {
      dependencies: [],
      subAssets: [],
      diagnostics: [
        assetDiagnostic(
          classification.kind === "inputActionMap" ? "invalid-input-action-map" : prefab ? "invalid-prefab" : "invalid-model",
          "error",
          `Could not analyze ${path.basename(sourcePath)}: ${error instanceof Error ? error.message : String(error)}`,
        ),
      ],
    };
  }
}
