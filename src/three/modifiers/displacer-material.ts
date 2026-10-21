import * as THREE from "three";
import { MeshPhysicalNodeMaterial } from "three/webgpu";
import type { UniformNode } from "three/webgpu";
import {
  abs,
  bumpMap,
  cameraPosition,
  clamp,
  dot,
  float,
  length,
  mix,
  modelWorldMatrix,
  normalLocal,
  normalize,
  positionLocal,
  pow,
  smoothstep,
  step,
  texture,
  triNoise3D,
  uniform,
  uv,
  vec3,
  vec4,
} from "../tsl";
import type { DisplacerModifier, SceneObject } from "../../types";
import { textureForMaterial } from "../texture-cache";

type MaterialSet = THREE.Material | THREE.Material[];
type ScalarUniform = UniformNode<"float", number>;
type Vec2Uniform = UniformNode<"vec2", THREE.Vector2>;

type DisplacerUniforms = {
  strength: ScalarUniform;
  midlevel: ScalarUniform;
  heightClamp: ScalarUniform;
  noiseScale: ScalarUniform;
  noiseDetail: ScalarUniform;
  noiseContrast: ScalarUniform;
  noiseSeed: ScalarUniform;
  textureInfluence: ScalarUniform;
  uvScale: Vec2Uniform;
  uvOffset: Vec2Uniform;
  bumpStrength: ScalarUniform;
  cameraNear: ScalarUniform;
  cameraFar: ScalarUniform;
};

export function activeDisplacerFor(object: SceneObject): DisplacerModifier | null {
  return (object.modifiers ?? []).find(
    (modifier): modifier is DisplacerModifier =>
      modifier.type === "displacer" &&
      modifier.enabled &&
      (
        (Math.abs(modifier.strength) > 0.0001 && modifier.heightClamp > 0.0001) ||
        (modifier.bumpEnabled && modifier.bumpStrength > 0.0001)
      ),
  ) ?? null;
}

export function displacerSignature(object: SceneObject): string {
  const modifier = activeDisplacerFor(object);
  if (!modifier) return "";
  return [
    modifier.id,
    modifier.direction,
    modifier.source,
    modifier.textureUrl ?? "",
    modifier.textureFlipY === false ? "n" : "y",
    modifier.textureChannel,
    modifier.bumpEnabled ? "bump" : "flat",
    modifier.cameraFade ? "fade" : "full",
  ].join(":");
}

function displacerUniforms(modifier: DisplacerModifier): DisplacerUniforms {
  const far = Math.max(0.001, modifier.cameraFar);
  const near = Math.min(Math.max(0, modifier.cameraNear), Math.max(0, far - 0.001));
  return {
    strength: uniform(modifier.strength),
    midlevel: uniform(modifier.midlevel),
    heightClamp: uniform(modifier.heightClamp),
    noiseScale: uniform(modifier.noiseScale),
    noiseDetail: uniform(modifier.noiseDetail),
    noiseContrast: uniform(modifier.noiseContrast),
    noiseSeed: uniform(modifier.noiseSeed),
    textureInfluence: uniform(modifier.textureInfluence),
    uvScale: uniform(new THREE.Vector2(modifier.uvScale[0], modifier.uvScale[1])),
    uvOffset: uniform(new THREE.Vector2(modifier.uvOffset[0], modifier.uvOffset[1])),
    bumpStrength: uniform(modifier.bumpStrength),
    cameraNear: uniform(near),
    cameraFar: uniform(far),
  };
}

function syncScalar(target: ScalarUniform, value: number): boolean {
  if (Math.abs(target.value - value) <= 1e-6) return false;
  target.value = value;
  return true;
}

function syncVector2(target: Vec2Uniform, value: [number, number]): boolean {
  if (target.value.x === value[0] && target.value.y === value[1]) return false;
  target.value.set(value[0], value[1]);
  return true;
}

function syncDisplacerUniforms(material: MeshPhysicalNodeMaterial, modifier: DisplacerModifier): boolean {
  const uniforms = material.userData.tganDisplacerUniforms as DisplacerUniforms | undefined;
  if (!uniforms || material.userData.tganDisplacerId !== modifier.id) return false;
  const far = Math.max(0.001, modifier.cameraFar);
  const near = Math.min(Math.max(0, modifier.cameraNear), Math.max(0, far - 0.001));
  let changed = false;
  changed = syncScalar(uniforms.strength, modifier.strength) || changed;
  changed = syncScalar(uniforms.midlevel, modifier.midlevel) || changed;
  changed = syncScalar(uniforms.heightClamp, modifier.heightClamp) || changed;
  changed = syncScalar(uniforms.noiseScale, modifier.noiseScale) || changed;
  changed = syncScalar(uniforms.noiseDetail, modifier.noiseDetail) || changed;
  changed = syncScalar(uniforms.noiseContrast, modifier.noiseContrast) || changed;
  changed = syncScalar(uniforms.noiseSeed, modifier.noiseSeed) || changed;
  changed = syncScalar(uniforms.textureInfluence, modifier.textureInfluence) || changed;
  changed = syncVector2(uniforms.uvScale, modifier.uvScale) || changed;
  changed = syncVector2(uniforms.uvOffset, modifier.uvOffset) || changed;
  changed = syncScalar(uniforms.bumpStrength, modifier.bumpStrength) || changed;
  changed = syncScalar(uniforms.cameraNear, near) || changed;
  changed = syncScalar(uniforms.cameraFar, far) || changed;
  return changed;
}

function sampleChannel(sample: ReturnType<typeof texture>, channel: DisplacerModifier["textureChannel"]) {
  if (channel === "red") return sample.r;
  if (channel === "green") return sample.g;
  if (channel === "blue") return sample.b;
  if (channel === "alpha") return sample.a;
  return dot(sample.rgb, vec3(0.2126, 0.7152, 0.0722));
}

function buildNoiseSource(uniforms: DisplacerUniforms) {
  const baseP = positionLocal.mul(uniforms.noiseScale).add(vec3(
    uniforms.noiseSeed,
    uniforms.noiseSeed.mul(1.37).add(11.3),
    uniforms.noiseSeed.mul(2.11).sub(7.1),
  ));
  const base = clamp(triNoise3D(baseP, 0, 0), 0, 1);
  const fineP = baseP.mul(2.73).add(vec3(13.7, 5.1, 19.9));
  const fine = clamp(triNoise3D(fineP, 0, 0), 0, 1);
  const ridged = float(1).sub(abs(fine.mul(2).sub(1)));
  const layered = mix(base, base.mul(0.72).add(ridged.mul(0.28)), uniforms.noiseDetail);
  return pow(clamp(layered, 0, 1), uniforms.noiseContrast);
}

function buildUvNoiseSource(uniforms: DisplacerUniforms) {
  const baseUv = uv().mul(uniforms.noiseScale);
  const baseP = vec3(
    baseUv.x.add(uniforms.noiseSeed),
    baseUv.y.add(uniforms.noiseSeed.mul(1.37).add(11.3)),
    uniforms.noiseSeed.mul(2.11).sub(7.1),
  );
  const base = clamp(triNoise3D(baseP, 0, 0), 0, 1);
  const fineP = baseP.mul(2.73).add(vec3(13.7, 5.1, 19.9));
  const fine = clamp(triNoise3D(fineP, 0, 0), 0, 1);
  const ridged = float(1).sub(abs(fine.mul(2).sub(1)));
  const layered = mix(base, base.mul(0.72).add(ridged.mul(0.28)), uniforms.noiseDetail);
  return pow(clamp(layered, 0, 1), uniforms.noiseContrast);
}

function buildTextureSource(
  material: THREE.Material,
  modifier: DisplacerModifier,
  uniforms: DisplacerUniforms,
) {
  if (!modifier.textureUrl) return null;
  const map = textureForMaterial(
    material,
    modifier.textureUrl,
    THREE.NoColorSpace,
    modifier.textureFlipY ?? true,
  );
  const sample = texture(map, uv().mul(uniforms.uvScale).add(uniforms.uvOffset));
  return clamp(sampleChannel(sample, modifier.textureChannel), 0, 1);
}

function buildHeightSource(material: THREE.Material, modifier: DisplacerModifier, uniforms: DisplacerUniforms) {
  const map = modifier.source !== "noise" ? buildTextureSource(material, modifier, uniforms) : null;
  if (!map && modifier.source === "texture") return uniforms.midlevel;
  if (modifier.source === "texture") return map ?? uniforms.midlevel;
  const noise = buildNoiseSource(uniforms);
  if (!map) return noise;
  if (modifier.source === "blend") return mix(noise, map, uniforms.textureInfluence);
  return noise;
}

function buildBumpHeightSource(material: THREE.Material, modifier: DisplacerModifier, uniforms: DisplacerUniforms) {
  const map = modifier.source !== "noise" ? buildTextureSource(material, modifier, uniforms) : null;
  if (!map && modifier.source === "texture") return uniforms.midlevel;
  if (modifier.source === "texture") return map ?? uniforms.midlevel;
  const noise = buildUvNoiseSource(uniforms);
  if (!map) return noise;
  if (modifier.source === "blend") return mix(noise, map, uniforms.textureInfluence);
  return noise;
}

function buildCameraGate(modifier: DisplacerModifier, uniforms: DisplacerUniforms) {
  if (!modifier.cameraFade) return float(1);
  const worldPosition = modelWorldMatrix.mul(vec4(positionLocal, 1)).xyz;
  const distanceToCamera = length(cameraPosition.sub(worldPosition));
  const rangeFade = float(1).sub(smoothstep(uniforms.cameraNear, uniforms.cameraFar, distanceToCamera));
  const hardGate = float(1).sub(step(uniforms.cameraFar, distanceToCamera));
  return rangeFade.mul(hardGate);
}

function buildDisplacedPosition(material: THREE.Material, modifier: DisplacerModifier, uniforms: DisplacerUniforms) {
  const source = buildHeightSource(material, modifier, uniforms);
  const centered = source.sub(uniforms.midlevel);
  const rawHeight = centered.mul(uniforms.strength);
  const maxHeight = uniforms.heightClamp;
  const height = clamp(rawHeight, maxHeight.negate(), maxHeight);
  const gate = buildCameraGate(modifier, uniforms);
  const direction = modifier.direction === "y" ? vec3(0, 1, 0) : normalize(normalLocal);
  return positionLocal.add(direction.mul(height.mul(gate)));
}

function buildBumpNormal(material: THREE.Material, modifier: DisplacerModifier, uniforms: DisplacerUniforms) {
  const source = buildBumpHeightSource(material, modifier, uniforms);
  return bumpMap(source, uniforms.bumpStrength.mul(buildCameraGate(modifier, uniforms)));
}

function applyDisplacerToMaterial(material: THREE.Material, modifier: DisplacerModifier): void {
  if (!(material instanceof MeshPhysicalNodeMaterial)) return;
  const uniforms = displacerUniforms(modifier);
  const displaced = buildDisplacedPosition(material, modifier, uniforms);

  material.positionNode = displaced;
  material.castShadowPositionNode = displaced;
  material.normalNode = modifier.bumpEnabled ? buildBumpNormal(material, modifier, uniforms) : null;
  material.userData = {
    ...material.userData,
    tganDisplacerId: modifier.id,
    tganDisplacerUniforms: uniforms,
  };
  material.needsUpdate = true;
}

export function applyDisplacerToMaterialSet(material: MaterialSet, object: SceneObject): void {
  const modifier = activeDisplacerFor(object);
  if (!modifier) return;
  if (Array.isArray(material)) {
    material.forEach((item) => applyDisplacerToMaterial(item, modifier));
    return;
  }
  applyDisplacerToMaterial(material, modifier);
}

function syncDisplacerMaterial(material: THREE.Material, modifier: DisplacerModifier): boolean {
  return material instanceof MeshPhysicalNodeMaterial
    ? syncDisplacerUniforms(material, modifier)
    : false;
}

export function syncDisplacerMaterialSet(material: MaterialSet, object: SceneObject): boolean {
  const modifier = activeDisplacerFor(object);
  if (!modifier) return false;
  if (Array.isArray(material)) {
    return material.reduce((changed, item) => syncDisplacerMaterial(item, modifier) || changed, false);
  }
  return syncDisplacerMaterial(material, modifier);
}

export function syncDisplacerMaterialsForBody(body: THREE.Object3D, object: SceneObject): boolean {
  let changed = false;
  body.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    changed = syncDisplacerMaterialSet(mesh.material, object) || changed;
  });
  return changed;
}
