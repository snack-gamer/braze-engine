import { describe, expect, it } from "vitest";
import { defaultCameraSettings } from "../../constants";
import { seedObjects } from "../testing/scene-objects";
import type { SceneObject } from "../../types";
import {
  commitAuthoredObjectTransform,
  deleteActiveSceneObject,
  duplicateActiveSceneObject,
  updateAuthoredSceneObject,
} from "./scene-object-commands";

describe("scene object commands", () => {
  it("duplicates an object with a deterministic identity and root offset", () => {
    const source = seedObjects.find((object) => object.primitive === "cube")!;
    const result = duplicateActiveSceneObject([source], source.id, () => "obj-test-dup");

    expect(result.selectedObjectId).toBe("obj-test-dup");
    expect(result.objects[1]).toMatchObject({
      id: "obj-test-dup",
      name: `${source.name} copy`,
      position: [source.position[0] + 0.6, source.position[1], source.position[2] + 0.6],
    });
  });

  it("uses collision-resistant identities for normal editor duplication", () => {
    const source = seedObjects.find((object) => object.primitive === "cube")!;
    const first = duplicateActiveSceneObject([source], source.id).selectedObjectId;
    const second = duplicateActiveSceneObject([source], source.id).selectedObjectId;
    expect(first).toMatch(/^obj-/);
    expect(second).not.toBe(first);
  });

  it("protects the final render camera", () => {
    const camera: SceneObject = {
      ...seedObjects[0],
      camera: { ...defaultCameraSettings },
    };
    const object = seedObjects.find((candidate) => candidate.primitive === "cube")!;

    expect(deleteActiveSceneObject([camera, object], camera.id).objects).toEqual([camera, object]);
    expect(deleteActiveSceneObject([camera, object], object.id)).toMatchObject({
      objects: [camera],
      selectedObjectId: camera.id,
    });
  });

  it("clamps scale and refuses duplicate authored bot profiles", () => {
    const first = { ...seedObjects[3], id: "first", botProfileId: "amber" };
    const second = { ...seedObjects[4], id: "second" };
    const objects = [first, second];

    const clamped = updateAuthoredSceneObject(objects, second.id, { scale: [0, -2, 3] });
    expect(clamped[1].scale).toEqual([0.001, 0.001, 3]);
    expect(updateAuthoredSceneObject(objects, second.id, { botProfileId: "amber" })).toBe(objects);
  });

  it("commits camera targets and mesh transforms through one authored boundary", () => {
    const camera = seedObjects[0];
    const mesh = seedObjects.find((object) => object.primitive === "cube")!;
    const cameraTarget: [number, number, number] = [4, 5, 6];
    const cameraResult = commitAuthoredObjectTransform([camera, mesh], camera.id, {
      position: [1, 2, 3],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      cameraTarget,
    });
    const meshResult = commitAuthoredObjectTransform([camera, mesh], mesh.id, {
      position: [7, 8, 9],
      rotation: [10, 20, 30],
      scale: [0, 2, 3],
    });

    expect(cameraResult[0].camera?.target).toEqual(cameraTarget);
    expect(meshResult[1]).toMatchObject({
      position: [7, 8, 9],
      rotation: [10, 20, 30],
      scale: [0.001, 2, 3],
    });
  });
});
