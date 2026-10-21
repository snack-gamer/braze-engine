import * as THREE from "three";

export type ImportedTextureKind =
  | "baseColor"
  | "normal"
  | "roughness"
  | "metalness"
  | "emissive"
  | "alpha"
  | "ao";

export type ImportedTextureDescriptor = {
  kind: ImportedTextureKind;
  texture: THREE.Texture;
  name: string;
  url?: string;
  flipY: boolean;
};

export type ImportedMaterialDescriptor = {
  slotKey: string;
  name: string;
  color: string;
  roughness: number;
  metalness: number;
  specularIntensity: number;
  clearcoat: number;
  clearcoatRoughness: number;
  ior: number;
  transmission: number;
  emissive: string;
  emissiveIntensity: number;
  opacity: number;
  normalScale: number;
  aoIntensity: number;
  alphaCutoff: number;
  envMapIntensity: number;
  thickness: number;
  sheen: number;
  sheenRoughness: number;
  sheenColor: string;
  side: "front" | "back" | "double";
  wireframe: boolean;
  transparent: boolean;
  textures: ImportedTextureDescriptor[];
};

const SLOT_KEYS = "tganMaterialSlotKeys";

type PhysicalMaterialLike = THREE.Material & {
  color?: THREE.Color;
  map?: THREE.Texture | null;
  normalMap?: THREE.Texture | null;
  roughness?: number;
  roughnessMap?: THREE.Texture | null;
  metalness?: number;
  metalnessMap?: THREE.Texture | null;
  normalScale?: THREE.Vector2;
  specularIntensity?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  ior?: number;
  transmission?: number;
  thickness?: number;
  sheen?: number;
  sheenRoughness?: number;
  sheenColor?: THREE.Color;
  envMapIntensity?: number;
  aoMapIntensity?: number;
  alphaTest?: number;
  emissive?: THREE.Color;
  emissiveMap?: THREE.Texture | null;
  emissiveIntensity?: number;
  alphaMap?: THREE.Texture | null;
  aoMap?: THREE.Texture | null;
  wireframe?: boolean;
};

function materialSet(material: THREE.Material | THREE.Material[] | undefined): THREE.Material[] {
  if (!material) return [];
  return Array.isArray(material) ? material : [material];
}

function colorToHex(color: THREE.Color | undefined, fallback: string): string {
  return color ? `#${color.getHexString()}` : fallback;
}

function textureUrl(texture: THREE.Texture): string | undefined {
  const image = texture.image as { src?: unknown; currentSrc?: unknown } | undefined;
  const raw = typeof image?.currentSrc === "string" && image.currentSrc
    ? image.currentSrc
    : typeof image?.src === "string"
      ? image.src
      : "";
  if (!raw || raw.startsWith("data:") || raw.startsWith("blob:")) return undefined;
  try {
    const url = new URL(raw, window.location.href);
    return `${url.pathname}${url.search}`;
  } catch {
    return raw;
  }
}

function textureName(texture: THREE.Texture, fallback: string): string {
  const url = textureUrl(texture);
  if (texture.name) return texture.name;
  if (!url) return fallback;
  return decodeURIComponent(url.split("/").pop() || fallback);
}

function textureDescriptor(
  material: PhysicalMaterialLike,
  kind: ImportedTextureKind,
  texture: THREE.Texture | null | undefined,
): ImportedTextureDescriptor | null {
  if (!texture) return null;
  const name = textureName(texture, `${material.name || "material"}-${kind}.png`);
  return { kind, texture, name, url: textureUrl(texture), flipY: texture.flipY };
}

function materialDescriptors(material: THREE.Material, slotKey: string): ImportedMaterialDescriptor {
  const src = material as PhysicalMaterialLike;
  const textures = [
    textureDescriptor(src, "baseColor", src.map),
    textureDescriptor(src, "normal", src.normalMap),
    textureDescriptor(src, "roughness", src.roughnessMap),
    textureDescriptor(src, "metalness", src.metalnessMap),
    textureDescriptor(src, "emissive", src.emissiveMap),
    textureDescriptor(src, "alpha", src.alphaMap),
    textureDescriptor(src, "ao", src.aoMap),
  ].filter((item): item is ImportedTextureDescriptor => item !== null);
  return {
    slotKey,
    name: material.name || "Imported Material",
    color: colorToHex(src.color, "#ffffff"),
    roughness: typeof src.roughness === "number" ? src.roughness : 0.55,
    metalness: typeof src.metalness === "number" ? src.metalness : 0,
    specularIntensity: typeof src.specularIntensity === "number" ? src.specularIntensity : 0.5,
    clearcoat: typeof src.clearcoat === "number" ? src.clearcoat : 0,
    clearcoatRoughness: typeof src.clearcoatRoughness === "number" ? src.clearcoatRoughness : 0.25,
    ior: typeof src.ior === "number" ? src.ior : 1.5,
    transmission: typeof src.transmission === "number" ? src.transmission : 0,
    emissive: colorToHex(src.emissive, "#000000"),
    emissiveIntensity: typeof src.emissiveIntensity === "number" ? src.emissiveIntensity : 0,
    opacity: material.opacity,
    normalScale: typeof src.normalScale?.x === "number" ? src.normalScale.x : 1,
    aoIntensity: typeof src.aoMapIntensity === "number" ? src.aoMapIntensity : 1,
    alphaCutoff: typeof src.alphaTest === "number" ? src.alphaTest : 0.05,
    envMapIntensity: typeof src.envMapIntensity === "number" ? src.envMapIntensity : 1,
    thickness: typeof src.thickness === "number" ? src.thickness : 0,
    sheen: typeof src.sheen === "number" ? src.sheen : 0,
    sheenRoughness: typeof src.sheenRoughness === "number" ? src.sheenRoughness : 0.5,
    sheenColor: colorToHex(src.sheenColor, "#ffffff"),
    side: material.side === THREE.FrontSide ? "front" : material.side === THREE.BackSide ? "back" : "double",
    wireframe: Boolean(src.wireframe),
    transparent: material.transparent,
    textures,
  };
}

function slotBaseName(material: THREE.Material): string {
  return (material.name || "material").trim()
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "material";
}

export function stampImportedMaterialSlots(root: THREE.Object3D): void {
  const materialKeys = new WeakMap<THREE.Material, string>();
  const nameCounts = new Map<string, number>();
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const keys = materialSet(mesh.material).map((material) => {
      const existing = materialKeys.get(material);
      if (existing) return existing;
      const base = slotBaseName(material);
      const count = nameCounts.get(base) ?? 0;
      nameCounts.set(base, count + 1);
      const key = `${base}:${count + 1}`;
      materialKeys.set(material, key);
      material.userData = { ...material.userData, tganMaterialSlotKey: key };
      return key;
    });
    mesh.userData[SLOT_KEYS] = keys;
  });
}

export function extractImportedMaterialDescriptors(root: THREE.Object3D): ImportedMaterialDescriptor[] {
  stampImportedMaterialSlots(root);
  const seen = new Set<string>();
  const out: ImportedMaterialDescriptor[] = [];
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const keys = mesh.userData[SLOT_KEYS] as string[] | undefined;
    materialSet(mesh.material).forEach((material, index) => {
      const slotKey = keys?.[index] ?? material.userData.tganMaterialSlotKey;
      if (!slotKey || seen.has(slotKey)) return;
      seen.add(slotKey);
      out.push(materialDescriptors(material, slotKey));
    });
  });
  return out;
}
