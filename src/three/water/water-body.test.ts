import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { SceneObject } from "../../types";
import { defaultWaterSettings } from "../../water/settings";
import { buildWaterBody, syncWaterBody } from "./water-body";

function waterObject(opacity: number): SceneObject {
  return {
    id: "water",
    name: "Water",
    primitive: "plane",
    visible: true,
    locked: false,
    solo: false,
    color: "#ffffff",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    water: { ...defaultWaterSettings, opacity },
  };
}

describe("water material synchronization", () => {
  it("rebuilds the material only when pipeline-affecting transparency changes", () => {
    const opaque = waterObject(1);
    const body = buildWaterBody(opaque);
    const material = body.material as THREE.MeshPhysicalMaterial;
    const initialVersion = material.version;

    syncWaterBody(body, opaque);
    expect(material.version).toBe(initialVersion);

    const translucent = waterObject(0.9);
    syncWaterBody(body, translucent);
    expect(material.version).toBe(initialVersion + 1);

    syncWaterBody(body, translucent);
    expect(material.version).toBe(initialVersion + 1);
    body.geometry.dispose();
    material.dispose();
  });
});
