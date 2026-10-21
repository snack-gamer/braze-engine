import { defaultCameraSettings } from "../../../src/constants";
import { makeObject } from "../../../src/lib/payload";
import { serializeSceneObject } from "../../../src/scene/serialization/scene-object-encoder";
import { basicSceneEnvironment, createSceneTemplate } from "../../../src/scene/application/scene-templates";
import { defaultColliderForObject, defaultRigidbodyForObject } from "../../../src/physics/authoring/component-defaults";

/** Multiple child surfaces keep the surviving authored body off the instancing path. */
export function physicsPoseLifetimeScene() {
  const source = createSceneTemplate("Physics Pose Lifetime");
  const body = makeObject("transform", 0, { id: "compound", position: [0, 1.5, 0] });
  body.rigidbody = { ...defaultRigidbodyForObject(body), useGravity: false };
  body.colliders = [{ ...defaultColliderForObject(body), size: [2, 1.4, 1], showGizmo: false }];
  const floor = makeObject("cube", 1, { id: "floor", position: [0, -0.14, 0], scale: [8, 0.2, 8] });
  floor.colliders = [{ ...defaultColliderForObject(floor), showGizmo: false }];
  const camera = makeObject("camera", 2, { id: "camera", position: [4, 3.5, 7],
    camera: { ...defaultCameraSettings, target: [0, 1, 0] } });
  const children = [
    makeObject("cube", 3, { id: "left", parentId: body.id, position: [-0.55, 0, 0], scale: [0.55, 0.8, 0.55], color: "#ff3fef" }),
    makeObject("cube", 4, { id: "right", parentId: body.id, position: [0.55, 0, 0], scale: [0.55, 0.8, 0.55], color: "#f59a23" }),
  ];
  for (const child of children) child.meshRenderer = { enabled: true, castShadows: true, receiveShadows: true };
  const sun = makeObject("directionalLight", 5, { id: "sun" });
  const environment = basicSceneEnvironment();
  return { ...source, activeCameraId: camera.id, activeObjectId: body.id,
    // Scene camera must stay outside the visible authored camera housing/lens.
    camera: { position: [0, 3.5, 7], target: [...camera.camera!.target], fov_degrees: camera.camera!.fov },
    environment: { ...environment, ao: { enabled: false }, sky: { ...environment.sky,
      cloudsCoverage: 0, cloudsDensity: 0, cloudsSpeed: 0, godraysIntensity: 0, scatteringIntensity: 0, fogDensity: 0 } },
    objects: [sun, camera, body, ...children, floor].map(serializeSceneObject) };
}
