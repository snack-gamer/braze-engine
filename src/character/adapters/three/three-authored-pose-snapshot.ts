import * as THREE from "three";

type ObjectPose = Readonly<{
  object: THREE.Object3D;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
  morphInfluences?: readonly number[];
}>;

/** Captures only state a character clip may overwrite and restores it on Stop. */
export class ThreeAuthoredPoseSnapshot {
  private readonly poses: readonly ObjectPose[];

  constructor(root: THREE.Object3D, additionalRoot?: THREE.Object3D) {
    const objects: THREE.Object3D[] = [];
    if (additionalRoot && additionalRoot !== root) objects.push(additionalRoot);
    root.traverse((object) => objects.push(object));
    this.poses = objects.map((object) => {
      const mesh = object as THREE.Mesh;
      return {
        object,
        position: object.position.clone(),
        quaternion: object.quaternion.clone(),
        scale: object.scale.clone(),
        ...(mesh.morphTargetInfluences
          ? { morphInfluences: [...mesh.morphTargetInfluences] }
          : {}),
      };
    });
  }

  restore(): void {
    for (const pose of this.poses) {
      pose.object.position.copy(pose.position);
      pose.object.quaternion.copy(pose.quaternion);
      pose.object.scale.copy(pose.scale);
      const mesh = pose.object as THREE.Mesh;
      if (pose.morphInfluences && mesh.morphTargetInfluences) {
        mesh.morphTargetInfluences.splice(0, mesh.morphTargetInfluences.length, ...pose.morphInfluences);
      }
    }
    this.poses[0]?.object.updateMatrixWorld(true);
  }

  restTransform(object: THREE.Object3D): ObjectPose | undefined {
    return this.poses.find((pose) => pose.object === object);
  }
}
