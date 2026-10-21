import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { importSanitizerChanged, sanitizeImportedAsset } from "./import-sanitize";

describe("sanitizeImportedAsset", () => {
  it("preserves authored emissive surfaces while removing imported lights and helpers", () => {
    const root = new THREE.Group();
    const emissiveMap = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({
      emissive: "#336699",
      emissiveIntensity: 2.5,
    });
    material.emissiveMap = emissiveMap;
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material));

    const light = new THREE.PointLight("#ffffff", 4);
    light.name = "Imported Fixture Light";
    root.add(light);
    const helper = new THREE.AxesHelper(1);
    helper.name = "Imported Helper";
    root.add(helper);

    const report = sanitizeImportedAsset(root);

    expect(material.emissive.getHexString()).toBe("336699");
    expect(material.emissiveIntensity).toBe(2.5);
    expect(material.emissiveMap).toBe(emissiveMap);
    expect(report.removedLights).toEqual(["Imported Fixture Light"]);
    expect(report.removedHelpers).toEqual(["Imported Helper"]);
    expect(root.children).not.toContain(light);
    expect(root.children).not.toContain(helper);
    expect(importSanitizerChanged(report)).toBe(true);
  });

  it("removes scene-owned baked and environment lighting without touching emission", () => {
    const root = new THREE.Group();
    const emissiveMap = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({
      emissive: "#ff6600",
      emissiveIntensity: 1.75,
    });
    material.emissiveMap = emissiveMap;
    material.lightMap = new THREE.Texture();
    material.envMap = new THREE.Texture();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material));

    const report = sanitizeImportedAsset(root);

    expect(material.emissive.getHexString()).toBe("ff6600");
    expect(material.emissiveIntensity).toBe(1.75);
    expect(material.emissiveMap).toBe(emissiveMap);
    expect(material.lightMap).toBeNull();
    expect(material.envMap).toBeNull();
    expect(report.strippedSceneLighting).toBe(1);
  });
});
