import path from "node:path";

const KIND_SUFFIXES = [
  { kind: "font", importerId: "braze.font", suffixes: [".woff2", ".woff", ".ttf", ".otf"] },
  { kind: "inputActionMap", importerId: "braze.input-action-map", suffixes: [".braze-input.json"] },
  {
    kind: "prefab",
    importerId: "braze.prefab",
    suffixes: [
      ".braze-prefab.json",
      ".braze.prefab.json",
      ".brazeprefab.json",
      ".tganprefab.json",
      ".prefab",
    ],
  },
  {
    kind: "material",
    importerId: "braze.material",
    suffixes: [
      ".braze.material.json",
      ".brazemat.json",
      ".material.json",
      ".material",
      ".mat",
      ".mtl",
    ],
  },
  {
    kind: "scene",
    importerId: "braze.scene",
    suffixes: [
      ".braze.scene.json",
      ".brazescene.json",
      ".scene.json",
      ".scene",
      ".unity",
    ],
  },
  {
    kind: "animation",
    importerId: "braze.animation",
    suffixes: [".braze.animation.json", ".anim"],
  },
  {
    kind: "controller",
    importerId: "braze.controller",
    suffixes: [".braze.controller.json", ".controller"],
  },
  {
    kind: "model",
    importerId: "braze.model",
    suffixes: [
      ".fbx",
      ".glb",
      ".gltf",
      ".obj",
      ".dae",
      ".blend",
      ".usd",
      ".usda",
      ".usdc",
      ".usdz",
      ".stl",
      ".ply",
      ".3ds",
    ],
  },
  {
    kind: "texture",
    importerId: "braze.texture",
    suffixes: [
      ".png",
      ".jpg",
      ".jpeg",
      ".webp",
      ".gif",
      ".bmp",
      ".tga",
      ".psd",
      ".tif",
      ".tiff",
      ".hdr",
      ".exr",
      ".ktx",
      ".ktx2",
      ".dds",
      ".svg",
    ],
  },
  {
    kind: "shader",
    importerId: "braze.shader",
    suffixes: [".shader", ".hlsl", ".cginc", ".wgsl", ".glsl", ".vert", ".frag"],
  },
  {
    kind: "audio",
    importerId: "braze.audio",
    suffixes: [
      ".wav",
      ".mp3",
      ".ogg",
      ".oga",
      ".m4a",
      ".aac",
      ".flac",
      ".opus",
      ".aiff",
      ".aif",
    ],
  },
  {
    kind: "script",
    importerId: "braze.script",
    suffixes: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".lua", ".py"],
  },
];

const GENERIC_CLASSIFICATION = Object.freeze({
  kind: "generic",
  importerId: "braze.generic",
  matchedSuffix: "",
});

export function classifyAssetSource(sourcePath) {
  const lower = String(sourcePath).toLowerCase();
  for (const classification of KIND_SUFFIXES) {
    const matchedSuffix = classification.suffixes.find((suffix) => lower.endsWith(suffix));
    if (matchedSuffix) {
      return {
        kind: classification.kind,
        importerId: classification.importerId,
        matchedSuffix,
      };
    }
  }
  return { ...GENERIC_CLASSIFICATION };
}

export function displayNameForSource(sourcePath) {
  const basename = path.basename(String(sourcePath));
  const { matchedSuffix } = classifyAssetSource(basename);
  return matchedSuffix ? basename.slice(0, -matchedSuffix.length) : basename;
}
