import * as THREE from "three";
import { normalizeClonerSettings } from "../../lib/cloner";
import { normalizeEffectorSettings } from "../../lib/effector";
import type { SceneObject } from "../../types";
import {
  applyEffectorToInstance,
  buildEffectorRuntime,
  identityEffectorState,
  pushApartPass,
  qmul,
  qnormalize,
  qrot,
  type EffectorContext,
  type EffectorInstanceState,
  type EffectorRuntime,
  type V3,
  type V4,
} from "../braze-effectors";
import type { Runtime } from "../runtime";
import { markIds } from "../transform";
import {
  applyLegacyCloneAdjustments,
  cloneCount,
  distributionTransform,
  type LocalTransform,
} from "./distribution";
import {
  localDistributionBounds,
  neighborsFor,
  sourceIndexFor,
} from "./distribution-planning";
import { effectorStackFor, type SourceEntry } from "./source-planning";
import { buildSurfaceSampler, composeLegacyMatrix } from "./surface-sampling";

const clonerWorldInverse = new THREE.Matrix4();
const baseMatrix = new THREE.Matrix4();
const instanceMatrix = new THREE.Matrix4();
const worldTrsMatrix = new THREE.Matrix4();
const localTrsMatrix = new THREE.Matrix4();
const decomposePos = new THREE.Vector3();
const decomposeQuat = new THREE.Quaternion();
const decomposeScale = new THREE.Vector3();
const composePos = new THREE.Vector3();
const composeQuat = new THREE.Quaternion();
const composeScale = new THREE.Vector3();

export function buildClonerOutput(
  runtime: Runtime,
  clonerObject: SceneObject,
  sources: SourceEntry[],
  objects: SceneObject[],
): THREE.Group {
  const cloner = normalizeClonerSettings(clonerObject.cloner);
  const output = new THREE.Group();
  output.name = `${clonerObject.name || clonerObject.id} Output`;
  output.userData.clonerOutput = true;
  markIds(output, clonerObject.id);

  if (!cloner.enabled || sources.length === 0) return output;

  const clonerNode = runtime.objectMap.get(clonerObject.id);
  if (!clonerNode) return output;
  clonerNode.updateMatrixWorld(true);
  clonerWorldInverse.copy(clonerNode.matrixWorld).invert();
  clonerNode.matrixWorld.decompose(decomposePos, decomposeQuat, decomposeScale);
  const rootPosition: V3 = [decomposePos.x, decomposePos.y, decomposePos.z];
  const rootRotation: V4 = [decomposeQuat.x, decomposeQuat.y, decomposeQuat.z, decomposeQuat.w];
  const rootScale: V3 = [decomposeScale.x, decomposeScale.y, decomposeScale.z];
  const rootScaleAbs: V3 = [Math.abs(rootScale[0]), Math.abs(rootScale[1]), Math.abs(rootScale[2])];

  const surfaceSampler = cloner.mode === "surface"
    ? buildSurfaceSampler(runtime, cloner.inputObjectId)
    : null;
  const count = cloneCount(cloner);
  const brazeMode = cloner.mode === "grid" || cloner.mode === "linear" || cloner.mode === "radial";

  const locals: LocalTransform[] = new Array(count);
  for (let index = 0; index < count; index++) {
    if (brazeMode) {
      const local = distributionTransform(cloner, index, count);
      applyLegacyCloneAdjustments(cloner, index, local);
      locals[index] = local;
    } else {
      composeLegacyMatrix(cloner, index, surfaceSampler, clonerWorldInverse)
        .decompose(decomposePos, decomposeQuat, decomposeScale);
      locals[index] = {
        position: [decomposePos.x, decomposePos.y, decomposePos.z],
        rotation: [decomposeQuat.x, decomposeQuat.y, decomposeQuat.z, decomposeQuat.w],
        scale: [decomposeScale.x, decomposeScale.y, decomposeScale.z],
      };
    }
  }

  const basePositions: V3[] = new Array(count);
  const baseRotations: V4[] = new Array(count);
  const baseScales: V3[] = new Array(count);
  for (let index = 0; index < count; index++) {
    const local = locals[index];
    const scaled: V3 = [local.position[0] * rootScale[0], local.position[1] * rootScale[1], local.position[2] * rootScale[2]];
    const rotated = qrot(rootRotation, scaled);
    basePositions[index] = [rootPosition[0] + rotated[0], rootPosition[1] + rotated[1], rootPosition[2] + rotated[2]];
    baseRotations[index] = qnormalize(qmul(rootRotation, local.rotation));
    baseScales[index] = [local.scale[0] * rootScaleAbs[0], local.scale[1] * rootScaleAbs[1], local.scale[2] * rootScaleAbs[2]];
  }

  const effectorObjects = effectorStackFor(cloner, objects);
  const states: EffectorInstanceState[] = new Array(count);
  for (let index = 0; index < count; index++) states[index] = identityEffectorState();

  if (effectorObjects.length > 0) {
    const bounds = localDistributionBounds(cloner, count, locals.map((local) => local.position));
    const context: EffectorContext = {
      time: performance.now() / 1000,
      objectWorldToLocal: clonerWorldInverse,
      objectRotation: rootRotation,
      boundsMin: bounds.min,
      boundsMax: bounds.max,
      instanceCount: count,
    };
    const runtimes: EffectorRuntime[] = [];
    for (const effectorObject of effectorObjects) {
      const node = runtime.objectMap.get(effectorObject.id);
      if (!node) continue;
      const settings = normalizeEffectorSettings(effectorObject.effector);
      runtimes.push(buildEffectorRuntime(settings, node, runtime.objectMap));
    }

    for (let stackIndex = 0; stackIndex < runtimes.length; stackIndex++) {
      const effector = runtimes[stackIndex];
      if (effector.settings.type === "pushApart") {
        let current = states.map((state) => state.position);
        let next: V3[] = new Array(count);
        const iterations = Math.min(32, Math.max(1, effector.settings.iterations));
        for (let pass = 0; pass < iterations; pass++) {
          pushApartPass(
            effector,
            basePositions,
            current,
            next,
            (index) => neighborsFor(cloner, index, count),
          );
          [current, next] = [next, current];
        }
        for (let index = 0; index < count; index++) states[index].position = current[index];
      } else {
        for (let index = 0; index < count; index++) {
          applyEffectorToInstance(
            effector,
            context,
            index,
            stackIndex,
            basePositions[index],
            baseRotations[index],
            states[index],
          );
        }
      }
    }
  }

  const assignments = sources.map(() => [] as THREE.Matrix4[]);
  for (let index = 0; index < count; index++) {
    const state = states[index];
    composePos.set(
      basePositions[index][0] + state.position[0],
      basePositions[index][1] + state.position[1],
      basePositions[index][2] + state.position[2],
    );
    const rotation = qnormalize(qmul(state.rotation, baseRotations[index]));
    composeQuat.set(rotation[0], rotation[1], rotation[2], rotation[3]);
    composeScale.set(
      baseScales[index][0] * state.scale[0],
      baseScales[index][1] * state.scale[1],
      baseScales[index][2] * state.scale[2],
    );
    worldTrsMatrix.compose(composePos, composeQuat, composeScale);
    localTrsMatrix.multiplyMatrices(clonerWorldInverse, worldTrsMatrix);
    assignments[sourceIndexFor(cloner, index, sources.length)].push(localTrsMatrix.clone());
  }

  sources.forEach((source, sourceIndex) => {
    const matrices = assignments[sourceIndex];
    if (matrices.length === 0) return;
    source.node.updateMatrixWorld(true);
    source.node.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || mesh.userData.clonerOutput || !mesh.geometry || !mesh.material) return;
      baseMatrix.multiplyMatrices(clonerWorldInverse, mesh.matrixWorld);
      const instanced = new THREE.InstancedMesh(mesh.geometry, mesh.material, matrices.length);
      instanced.castShadow = mesh.castShadow;
      instanced.receiveShadow = mesh.receiveShadow;
      instanced.frustumCulled = true;
      instanced.userData.clonerOutput = true;
      instanced.userData.sharedGeometry = true;
      instanced.userData.sharedMaterial = true;
      markIds(instanced, clonerObject.id);
      matrices.forEach((matrix, matrixIndex) => {
        instanceMatrix.multiplyMatrices(matrix, baseMatrix);
        instanced.setMatrixAt(matrixIndex, instanceMatrix);
      });
      instanced.instanceMatrix.needsUpdate = true;
      instanced.computeBoundingSphere();
      output.add(instanced);
    });
  });

  return output;
}
