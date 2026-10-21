import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { characterRuntimeSuccess } from "../../runtime/diagnostics";
import type { ThreeAnimatorClipResource } from "./three-animator-clip-resource";
import { ThreeCanonicalClipResourceCache } from "./three-canonical-clip-resource-cache";

function resource(index: number): ThreeAnimatorClipResource {
  const root = new THREE.Group();
  const tracks = Array.from({ length: 512 }, (_, trackIndex) => (
    new THREE.NumberKeyframeTrack(`Node${trackIndex}.visible`, [0], [index])
  ));
  return {
    bindings: [{
      root,
      clip: new THREE.AnimationClip(`Clip ${index}`, 1, tracks),
    }],
  };
}

describe("Three canonical clip resource cache", () => {
  it("retries transient aggregate-budget failures after the active set shrinks", () => {
    const cache = new ThreeCanonicalClipResourceCache();
    const resources = Array.from({ length: 9 }, (_, index) => resource(index));
    for (const candidate of resources.slice(0, 8)) {
      expect(cache.resolve(
        candidate,
        new Set(resources),
        () => characterRuntimeSuccess(candidate),
      ).value).not.toBeNull();
    }
    const compile = vi.fn(() => characterRuntimeSuccess(resources[8]!));

    const pressured = cache.resolve(resources[8]!, new Set(resources), compile);
    expect(pressured.value).toBeNull();
    expect(pressured.diagnostics[0]?.code).toBe("three-animation-canonical-track-limit-exceeded");

    const recovered = cache.resolve(resources[8]!, new Set([resources[8]!]), compile);
    expect(recovered.value).not.toBeNull();
    expect(compile).toHaveBeenCalledTimes(2);
  });
});
