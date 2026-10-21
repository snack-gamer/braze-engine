import type { ParticleCollider, ParticleEffector } from '@particles/core';
import * as THREE from 'three';
import type { GpuFieldEffector, GpuParticleCollider } from './backend';
import { MAX_FIELD_EFFECTORS, MAX_PARTICLE_COLLIDERS } from './particle-influence-limits';

type SimulationSpace = 'local' | 'world';

/** Reusable CPU staging for the bounded effector/collider uniform payload. */
export class ParticleInfluenceFrame {
  readonly fieldEffectors: GpuFieldEffector[] = [];
  readonly colliders: GpuParticleCollider[] = [];
  readonly colliderIds: string[] = [];

  private readonly fieldEffectorPool: GpuFieldEffector[] = [];
  private readonly colliderPool: GpuParticleCollider[] = [];
  private readonly position = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly axisX = new THREE.Vector3();
  private readonly axisY = new THREE.Vector3();
  private readonly axisZ = new THREE.Vector3();
  private readonly inverse = new THREE.Matrix4();
  private readonly normal = new THREE.Matrix3();
  private readonly euler = new THREE.Euler();

  update(
    effectors: readonly ParticleEffector[],
    colliders: readonly ParticleCollider[],
    emitterId: string,
    simulationSpace: SimulationSpace,
    matrixWorld: THREE.Matrix4,
  ): void {
    const local = simulationSpace === 'local';
    if (local) {
      this.inverse.copy(matrixWorld).invert();
      this.normal.getNormalMatrix(this.inverse);
    }
    this.writeEffectors(effectors, emitterId, local);
    this.writeColliders(colliders, emitterId, local);
  }

  private writeEffectors(
    effectors: readonly ParticleEffector[],
    emitterId: string,
    local: boolean,
  ): void {
    let count = 0;
    for (const effector of effectors) {
      if (!effector.enabled || !affectsEmitter(effector.affectedEmitterIds, emitterId)) continue;
      if (count === MAX_FIELD_EFFECTORS) break;
      const target = this.fieldEffectorPool[count] ?? createFieldEffector();
      if (count === this.fieldEffectorPool.length) this.fieldEffectorPool.push(target);

      this.position.set(
        effector.transform.position[0],
        effector.transform.position[1],
        effector.transform.position[2],
      );
      this.direction.set(effector.direction[0], effector.direction[1], effector.direction[2]).normalize();
      this.euler.set(
        effector.transform.rotation[0],
        effector.transform.rotation[1],
        effector.transform.rotation[2],
      );
      this.direction.applyEuler(this.euler).normalize();
      if (local) {
        this.position.applyMatrix4(this.inverse);
        this.direction.applyMatrix3(this.normal).normalize();
      }

      target.type = effector.type;
      target.shape = effector.shape;
      target.falloff = effector.falloff;
      target.strength = effector.strength;
      writeVec3(target.position, this.position.x, this.position.y, this.position.z);
      writeVec3(target.direction, this.direction.x || 1, this.direction.y || 0, this.direction.z || 0);
      target.vortexMode = effector.vortexMode;
      target.vortexPull = effector.vortexPull;
      target.vortexOrbitRadius = effector.vortexOrbitRadius;
      target.vortexLift = effector.vortexLift;
      target.vortexAxialDamping = effector.vortexAxialDamping;
      target.vortexLiftVariation = effector.vortexLiftVariation;
      target.turbulenceDetail = effector.turbulenceDetail;
      target.turbulenceScale = effector.turbulenceScale;
      target.turbulenceScaleRandom = effector.turbulenceScaleRandom;
      target.randomStrength = effector.randomStrength;
      target.randomPosition = effector.randomPosition;
      target.randomDirection = effector.randomDirection;
      target.radius = effector.radius * Math.max(
        effector.transform.scale[0],
        effector.transform.scale[1],
        effector.transform.scale[2],
      );
      writeVec3(
        target.size,
        effector.size[0] * effector.transform.scale[0],
        effector.size[1] * effector.transform.scale[1],
        effector.size[2] * effector.transform.scale[2],
      );
      this.fieldEffectors[count] = target;
      count++;
    }
    this.fieldEffectors.length = count;
  }

  private writeColliders(
    colliders: readonly ParticleCollider[],
    emitterId: string,
    local: boolean,
  ): void {
    let count = 0;
    for (const collider of colliders) {
      if (!collider.enabled || !affectsEmitter(collider.affectedEmitterIds, emitterId)) continue;
      if (count === MAX_PARTICLE_COLLIDERS) break;
      const target = this.colliderPool[count] ?? createParticleCollider();
      if (count === this.colliderPool.length) this.colliderPool.push(target);

      this.position.set(
        collider.transform.position[0],
        collider.transform.position[1],
        collider.transform.position[2],
      );
      this.euler.set(
        collider.transform.rotation[0],
        collider.transform.rotation[1],
        collider.transform.rotation[2],
      );
      this.axisX.set(1, 0, 0).applyEuler(this.euler).normalize();
      this.axisY.set(0, 1, 0).applyEuler(this.euler).normalize();
      this.axisZ.set(0, 0, 1).applyEuler(this.euler).normalize();
      if (local) {
        this.position.applyMatrix4(this.inverse);
        this.axisX.applyMatrix3(this.normal).normalize();
        this.axisY.applyMatrix3(this.normal).normalize();
        this.axisZ.applyMatrix3(this.normal).normalize();
      }

      const scaleX = Math.abs(collider.transform.scale[0]);
      const scaleY = Math.abs(collider.transform.scale[1]);
      const scaleZ = Math.abs(collider.transform.scale[2]);
      target.type = collider.type;
      writeVec3(target.position, this.position.x, this.position.y, this.position.z);
      writeVec3(target.axisX, this.axisX.x || 1, this.axisX.y || 0, this.axisX.z || 0);
      writeVec3(target.axisY, this.axisY.x || 0, this.axisY.y || 1, this.axisY.z || 0);
      writeVec3(target.axisZ, this.axisZ.x || 0, this.axisZ.y || 0, this.axisZ.z || 1);
      target.radius = collider.radius * Math.max(scaleX, scaleY, scaleZ);
      writeVec3(
        target.size,
        collider.size[0] * scaleX,
        collider.size[1] * scaleY,
        collider.size[2] * scaleZ,
      );
      target.bounce = collider.bounce;
      target.friction = collider.friction;
      target.stickiness = collider.stickiness;
      target.settleSpeed = collider.settleSpeed;
      this.colliders[count] = target;
      this.colliderIds[count] = collider.id;
      count++;
    }
    this.colliders.length = count;
    this.colliderIds.length = count;
  }
}

function affectsEmitter(affectedEmitterIds: readonly string[], emitterId: string): boolean {
  return affectedEmitterIds.length === 0 || affectedEmitterIds.includes(emitterId);
}

function createFieldEffector(): GpuFieldEffector {
  return {
    type: 'directionalForce',
    shape: 'sphere',
    falloff: 'smooth',
    strength: 0,
    position: [0, 0, 0],
    direction: [1, 0, 0],
    radius: 0,
    size: [0, 0, 0],
  };
}

function createParticleCollider(): GpuParticleCollider {
  return {
    type: 'plane',
    position: [0, 0, 0],
    axisX: [1, 0, 0],
    axisY: [0, 1, 0],
    axisZ: [0, 0, 1],
    radius: 0,
    size: [0, 0, 0],
    bounce: 0,
    friction: 0,
    stickiness: 0,
    settleSpeed: 0,
  };
}

function writeVec3(target: [number, number, number], x: number, y: number, z: number): void {
  target[0] = x;
  target[1] = y;
  target[2] = z;
}
