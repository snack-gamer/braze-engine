import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createEditorGrid } from "./editor-grid";

describe("editor grid", () => {
  it("uses one depth-tested surface and updates settings without rebuilding resources", () => {
    const grid = createEditorGrid({ color: "#536061", size: 18, opacity: 0.25 });
    const geometry = grid.object.geometry;
    const material = grid.object.material;
    const texture = material.map;

    expect(grid.object).toBeInstanceOf(THREE.Mesh);
    expect(grid.object.children).toHaveLength(0);
    expect(material.depthTest).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.opacity).toBe(0.25);

    grid.setOpacity(0.08);
    grid.setColor("#ffffff");
    grid.setExtent(40, 2);
    grid.setGroundHeight(-3);
    grid.setVisible(false);

    expect(grid.object.geometry).toBe(geometry);
    expect(grid.object.material).toBe(material);
    expect(material.opacity).toBe(0.08);
    expect(material.color.getHexString()).toBe("ffffff");
    expect(grid.object.scale.toArray()).toEqual([40, 40, 1]);
    expect(grid.object.position.y).toBe(-3);
    expect(grid.object.visible).toBe(false);
    expect(texture?.repeat.toArray()).toEqual([2, 2]);
    expect(texture?.offset.toArray()).toEqual([-1, -1]);
    // Non-multiple extents must not move the origin between grid cells.
    grid.setExtent(23);
    const originUv = texture!.transformUv(new THREE.Vector2(0.5, 0.5));
    expect(originUv.x % 1).toBeCloseTo(0);
    expect(originUv.y % 1).toBeCloseTo(0);
    grid.dispose();
  });

  it("clamps opacity and safely disposes more than once", () => {
    const grid = createEditorGrid({ color: "#000000", size: 2, opacity: 4 });
    let geometryDisposals = 0;
    grid.object.geometry.addEventListener("dispose", () => { geometryDisposals += 1; });
    expect(grid.object.material.opacity).toBe(1);
    grid.setOpacity(-2);
    expect(grid.object.material.opacity).toBe(0);
    expect(grid.object.visible).toBe(false);
    grid.dispose();
    grid.dispose();
    expect(geometryDisposals).toBe(1);
  });
});
