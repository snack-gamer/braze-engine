import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_EDITOR_GRID_STYLE } from "../editor/domain/editor-grid-style";
import { createEditorGrid, type EditorGrid } from "./editor-grid";

const linesOf = (grid: EditorGrid) => grid.object.children as THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>[];
const positionsOf = (line: THREE.LineSegments) => Array.from(line.geometry.getAttribute("position").array);

describe("editor grid", () => {
  it("uses thin ground lines with neutral origin lines and depth-tested transparent ordering", () => {
    const grid = createEditorGrid({ color: "#59616d", size: 23, opacity: 0.56 });
    const [minor, major] = linesOf(grid);
    expect(grid.object).toBeInstanceOf(THREE.Group);
    expect(grid.object.children).toHaveLength(2);
    expect(minor.material.opacity).toBeCloseTo(0.56 * 0.52);
    expect(major.material.opacity).toBe(0.56);
    expect(major.material.color.getHexString()).toBe("59616d");
    expect(positionsOf(major).slice(12, 24)).toEqual([-12, 0, 0, 12, 0, 0, 0, 0, -12, 0, 0, 12]);
    expect(positionsOf(major)).toContain(10);
    expect(positionsOf(major)).toContain(-10);
    for (const line of linesOf(grid)) {
      expect(line).toBeInstanceOf(THREE.LineSegments);
      expect(line.material.depthTest).toBe(true);
      expect(line.material.depthWrite).toBe(false);
      expect(line.material.toneMapped).toBe(false);
      expect(line.renderOrder).toBeLessThan(0);
      expect(line.userData.editorChrome).toBe(true);
      expect(positionsOf(line).filter((_, i) => i % 3 === 1).every((y) => y === 0)).toBe(true);
    }
    const raycaster = new THREE.Raycaster(new THREE.Vector3(0, 10, 0), new THREE.Vector3(0, -1, 0));
    expect(raycaster.intersectObject(grid.object, true)).toEqual([]);
    grid.dispose();
  });

  it("preserves resources for styling and unchanged extents, including preview cell sizes", () => {
    const grid = createEditorGrid({ color: "#59616d", size: 10, cellSize: 0.5, opacity: 0.56 });
    const lines = linesOf(grid);
    const geometries = lines.map((line) => line.geometry);
    const materials = lines.map((line) => line.material);
    grid.setOpacity(0.08);
    grid.setColor("#ffffff");
    grid.setGroundHeight(-3);
    grid.setVisible(false);
    grid.setExtent(10, 0.5);
    expect(lines.map((line) => line.geometry)).toEqual(geometries);
    expect(lines.map((line) => line.material)).toEqual(materials);
    expect(lines[0].material.opacity).toBeCloseTo(0.08 * DEFAULT_EDITOR_GRID_STYLE.minorLineOpacity);
    expect(lines[1].material.opacity).toBe(0.08);
    expect(lines[1].material.color.getHexString()).toBe("ffffff");
    expect(positionsOf(lines[0])).toContain(0.5);
    expect(grid.object.position.y).toBe(-3);
    expect(grid.object.visible).toBe(false);
    grid.dispose();
  });

  it("releases replaced geometry and disposes every owned resource exactly once", () => {
    const grid = createEditorGrid({ color: "#000000", size: 18, opacity: 1 });
    const parent = new THREE.Scene();
    parent.add(grid.object);
    const lines = linesOf(grid).slice();
    const previous = lines.map((line) => vi.spyOn(line.geometry, "dispose"));
    const materials = lines.map((line) => vi.spyOn(line.material, "dispose"));
    grid.setExtent(40, 2);
    previous.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
    materials.forEach((spy) => expect(spy).not.toHaveBeenCalled());
    expect(positionsOf(lines[1])).toContain(20);
    const current = lines.map((line) => vi.spyOn(line.geometry, "dispose"));
    grid.dispose();
    grid.dispose();
    grid.setExtent(60);
    [...previous, ...current, ...materials].forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
    expect(parent.children).toHaveLength(0);
    expect(grid.object.children).toHaveLength(0);
  });

  it("bounds geometry and sanitizes opacity and invalid dimensions", () => {
    const grid = createEditorGrid({ color: "#000000", size: 1e6, cellSize: 0.001, opacity: 4 });
    expect(linesOf(grid).reduce((count, line) => count + line.geometry.getAttribute("position").count, 0)).toBeLessThanOrEqual(8_004);
    expect(linesOf(grid)[1].material.opacity).toBe(1);
    grid.setOpacity(-2);
    expect(grid.object.visible).toBe(false);
    grid.setVisible(true);
    expect(grid.object.visible).toBe(false);
    grid.setOpacity(0.5);
    expect(grid.object.visible).toBe(true);
    grid.setExtent(NaN, 0);
    grid.setGroundHeight(Infinity);
    expect(positionsOf(linesOf(grid)[1])).toEqual([-1, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 1]);
    expect(grid.object.position.y).toBe(0);
    grid.dispose();
  });
});
