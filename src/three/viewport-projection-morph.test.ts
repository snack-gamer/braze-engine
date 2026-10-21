import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  blendProjectionMatrices,
  matchingOrthographicProjection,
} from "./viewport-projection-morph";

describe("viewport projection morph math", () => {
  it("matches orthographic scale to perspective at the orbit target plane", () => {
    const camera = new THREE.PerspectiveCamera(60, 2, 0.1, 100);
    const matrix = matchingOrthographicProjection(camera, 10);
    const expectedHalfHeight = 10 * Math.tan(Math.PI / 6);
    expect(matrix.elements[0]).toBeCloseTo(1 / (expectedHalfHeight * 2), 8);
    expect(matrix.elements[5]).toBeCloseTo(1 / expectedHalfHeight, 8);
  });

  it("produces real intermediate matrices without changing either endpoint", () => {
    const camera = new THREE.PerspectiveCamera(52, 1.5, 0.01, 150);
    camera.updateProjectionMatrix();
    const perspective = camera.projectionMatrix.clone();
    const orthographic = matchingOrthographicProjection(camera, 8);
    const midpoint = blendProjectionMatrices(perspective, orthographic, 0.5);

    blendProjectionMatrices(perspective, orthographic, 0).elements.forEach((value, index) => {
      expect(value).toBeCloseTo(perspective.elements[index]!, 12);
    });
    blendProjectionMatrices(perspective, orthographic, 1).elements.forEach((value, index) => {
      expect(value).toBeCloseTo(orthographic.elements[index]!, 12);
    });
    expect(midpoint.elements).not.toEqual(perspective.elements);
    expect(midpoint.elements).not.toEqual(orthographic.elements);
    expect(midpoint.elements[11]).toBeCloseTo(
      (perspective.elements[11]! + orthographic.elements[11]!) * 0.5,
      8,
    );
  });
});
