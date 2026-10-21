import { assetDiagnostic } from "./asset-diagnostics.mjs";
import { sourceItemLabel } from "./gltf-source-context.mjs";

function collection(document, key, diagnostics) {
  const value = document[key];
  if (value === undefined) return [];
  if (Array.isArray(value)) return value;
  diagnostics.push(assetDiagnostic(
    `gltf-${key}-invalid`,
    "error",
    `glTF ${key} must be an array.`,
  ));
  return [];
}

/** Reports malformed character-relevant glTF collections before deriving partial artifacts. */
export function validateGltfCharacterDocument(document, diagnostics) {
  const meshes = collection(document, "meshes", diagnostics);
  collection(document, "nodes", diagnostics);
  const animations = collection(document, "animations", diagnostics);
  const accessors = collection(document, "accessors", diagnostics);

  meshes.forEach((mesh, sourceIndex) => {
    if (!mesh || typeof mesh !== "object" || Array.isArray(mesh)) {
      diagnostics.push(assetDiagnostic(
        "gltf-mesh-invalid",
        "error",
        `Mesh ${sourceIndex + 1} is not an object.`,
        { sourceIndex },
      ));
      return;
    }
    if (!Array.isArray(mesh.primitives) || mesh.primitives.length === 0) {
      diagnostics.push(assetDiagnostic(
        "gltf-mesh-primitives-invalid",
        "error",
        `${sourceItemLabel(mesh, "Mesh", sourceIndex)} must contain mesh primitives.`,
        { sourceIndex },
      ));
    }
  });

  animations.forEach((animation, sourceIndex) => {
    const valid = animation
      && typeof animation === "object"
      && !Array.isArray(animation)
      && Array.isArray(animation.channels)
      && animation.channels.length > 0
      && Array.isArray(animation.samplers)
      && animation.samplers.length > 0;
    if (valid) return;
    diagnostics.push(assetDiagnostic(
      "gltf-animation-invalid",
      "error",
      `${sourceItemLabel(animation, "Animation", sourceIndex)} must contain channels and samplers.`,
      { sourceIndex },
    ));
  });

  accessors.forEach((accessor, sourceIndex) => {
    if (accessor && typeof accessor === "object" && !Array.isArray(accessor)) return;
    diagnostics.push(assetDiagnostic(
      "gltf-accessor-invalid",
      "error",
      `Accessor ${sourceIndex + 1} is not an object.`,
      { sourceIndex },
    ));
  });
}
