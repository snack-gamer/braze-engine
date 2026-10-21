import * as THREE from "three";
import type { Material } from "../../materials/domain/material";
import type { PreparedAssetPreview } from "./prepared-asset-preview";

const textureLoader = new THREE.TextureLoader();

async function loadTexture(
  url: string | undefined,
  colorSpace: THREE.ColorSpace,
  flipY: boolean,
): Promise<THREE.Texture | null> {
  if (!url) return null;
  try {
    const texture = await textureLoader.loadAsync(url);
    texture.colorSpace = colorSpace;
    texture.flipY = flipY;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    return texture;
  } catch {
    return null;
  }
}

async function bindTextures(
  surface: THREE.MeshPhysicalMaterial,
  material: Material,
): Promise<THREE.Texture[]> {
  const [map, normalMap, bumpMap, roughnessMap, metalnessMap, emissiveMap, alphaMap, aoMap] = await Promise.all([
    loadTexture(material.baseColorTextureUrl, THREE.SRGBColorSpace, material.baseColorTextureFlipY ?? true),
    loadTexture(material.normalTextureUrl, THREE.NoColorSpace, material.normalTextureFlipY ?? true),
    loadTexture(material.bumpTextureUrl, THREE.NoColorSpace, material.bumpTextureFlipY ?? true),
    loadTexture(material.roughnessTextureUrl, THREE.NoColorSpace, material.roughnessTextureFlipY ?? true),
    loadTexture(material.metalnessTextureUrl, THREE.NoColorSpace, material.metalnessTextureFlipY ?? true),
    loadTexture(material.emissiveTextureUrl, THREE.SRGBColorSpace, material.emissiveTextureFlipY ?? true),
    loadTexture(material.alphaTextureUrl, THREE.NoColorSpace, material.alphaTextureFlipY ?? true),
    loadTexture(material.aoTextureUrl, THREE.NoColorSpace, material.aoTextureFlipY ?? true),
  ]);
  Object.assign(surface, {
    map, normalMap, bumpMap, roughnessMap, metalnessMap, emissiveMap, alphaMap, aoMap,
  });
  if (alphaMap) {
    surface.alphaTest = material.alphaCutoff;
    surface.transparent = true;
    surface.transmission = 0;
  }
  surface.needsUpdate = true;
  return [map, normalMap, bumpMap, roughnessMap, metalnessMap, emissiveMap, alphaMap, aoMap]
    .filter((texture): texture is THREE.Texture => texture !== null);
}

function createSurface(material: Material): THREE.MeshPhysicalMaterial {
  const surface = new THREE.MeshPhysicalMaterial({
    color: material.color,
    roughness: material.roughness,
    metalness: material.metalness,
    specularIntensity: material.specularIntensity,
    clearcoat: material.clearcoat,
    clearcoatRoughness: material.clearcoatRoughness,
    ior: material.ior,
    transmission: material.transmission,
    emissive: material.emissive,
    emissiveIntensity: material.emissiveIntensity,
    opacity: material.opacity,
    transparent: material.opacity < 1 || material.transmission > 0.01,
    depthWrite: material.opacity >= 1 && material.transmission <= 0.01,
    envMapIntensity: material.envMapIntensity,
    thickness: material.thickness,
    sheen: material.sheen,
    sheenRoughness: material.sheenRoughness,
    sheenColor: material.sheenColor,
    side: material.side === "front"
      ? THREE.FrontSide
      : material.side === "back" ? THREE.BackSide : THREE.DoubleSide,
    wireframe: material.wireframe,
  });
  surface.normalScale.setScalar(material.normalScale);
  surface.bumpScale = material.bumpScale;
  surface.aoMapIntensity = material.aoIntensity;
  return surface;
}

export async function prepareMaterialAssetPreview(
  material: Material,
  aspect: number,
  signal: AbortSignal,
): Promise<PreparedAssetPreview | null> {
  const surface = createSurface(material);
  const textures = await bindTextures(surface, material);
  if (signal.aborted) {
    textures.forEach((texture) => texture.dispose());
    surface.dispose();
    return null;
  }

  const geometry = new THREE.SphereGeometry(1, 64, 40);
  geometry.setAttribute("uv1", geometry.getAttribute("uv").clone());
  const sphere = new THREE.Mesh(geometry, surface);
  sphere.rotation.set(-0.08, -0.35, 0);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1b1e22);
  scene.add(sphere);
  scene.add(new THREE.HemisphereLight(0xeaf2ff, 0x252832, 1.8));
  const key = new THREE.DirectionalLight(0xffffff, 4.2);
  key.position.set(-3.5, 4.5, 5);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xaac8ff, 1.6);
  fill.position.set(4, 1, 3);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffd6b0, 1.9);
  rim.position.set(-4, -2, -3);
  scene.add(rim);
  const camera = new THREE.PerspectiveCamera(32, aspect, 0.1, 10);
  camera.position.set(0, 0, 4.1);
  camera.lookAt(0, 0, 0);
  return {
    camera,
    scene,
    dispose: () => {
      geometry.dispose();
      surface.dispose();
      textures.forEach((texture) => texture.dispose());
      scene.clear();
    },
  };
}
