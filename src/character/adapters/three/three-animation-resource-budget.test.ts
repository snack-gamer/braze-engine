import type * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  assessThreeAnimationResourceTracks,
  EMPTY_THREE_ANIMATION_TRACK_COUNTS,
  extendThreeAnimationCacheBudget,
  THREE_ANIMATION_RESOURCE_LIMITS,
  subtractThreeAnimationTrackCounts,
} from "./three-animation-resource-budget";

describe("Three animation resource budget", () => {
  it("accepts exact resource track, keyframe, value, and binding boundaries", () => {
    const limits = THREE_ANIMATION_RESOURCE_LIMITS;
    expect(assessThreeAnimationResourceTracks([
      Array.from({ length: limits.maximumTracksPerResource }, () => track()),
    ]).value?.tracks).toBe(limits.maximumTracksPerResource);
    const dataBoundary = assessThreeAnimationResourceTracks([[
      track(limits.maximumKeyframesPerResource, 4),
    ]]);
    expect(dataBoundary.value).toEqual({
      tracks: 1,
      keyframes: limits.maximumKeyframesPerResource,
      values: limits.maximumValuesPerResource,
    });
    expect(assessThreeAnimationResourceTracks(
      Array.from({ length: limits.maximumBindingsPerResource }, () => []),
    ).value).toEqual(EMPTY_THREE_ANIMATION_TRACK_COUNTS);
  });

  it("rejects every independent resource dimension and malformed layouts", () => {
    const limits = THREE_ANIMATION_RESOURCE_LIMITS;
    expect(code(Array.from({ length: limits.maximumBindingsPerResource + 1 }, () => [])))
      .toBe("three-animation-binding-limit-exceeded");
    expect(code([Array.from({ length: limits.maximumTracksPerResource + 1 }, () => track())]))
      .toBe("three-animation-track-limit-exceeded");
    expect(code([[track(limits.maximumKeyframesPerResource + 1, 1)]]))
      .toBe("three-animation-keyframe-limit-exceeded");
    expect(code([[track(1, limits.maximumValuesPerResource + 1)]]))
      .toBe("three-animation-value-limit-exceeded");
    expect(code([[track(0, 1)]])).toBe("invalid-three-animation-track-layout");
    expect(code([[trackWithLengths(3, 4)]])).toBe("invalid-three-animation-track-layout");
  });

  it("accepts exact character cache boundaries and rejects one unit beyond each", () => {
    const limits = THREE_ANIMATION_RESOURCE_LIMITS;
    const boundary = {
      tracks: limits.maximumCachedTracksPerCharacter,
      keyframes: limits.maximumCachedKeyframesPerCharacter,
      values: limits.maximumCachedValuesPerCharacter,
    };
    expect(extendThreeAnimationCacheBudget(
      EMPTY_THREE_ANIMATION_TRACK_COUNTS,
      boundary,
      "prepared",
    ).value).toEqual(boundary);
    expect(cacheCode({ ...boundary, tracks: boundary.tracks + 1 }, "canonical"))
      .toBe("three-animation-canonical-track-limit-exceeded");
    expect(cacheCode({ ...boundary, keyframes: boundary.keyframes + 1 }, "prepared"))
      .toBe("three-animation-prepared-keyframe-limit-exceeded");
    expect(cacheCode({ ...boundary, values: boundary.values + 1 }, "prepared"))
      .toBe("three-animation-prepared-value-limit-exceeded");
    expect(subtractThreeAnimationTrackCounts(boundary, boundary))
      .toEqual(EMPTY_THREE_ANIMATION_TRACK_COUNTS);
  });
});

function track(keyframes = 1, valuesPerKey = 1): Pick<THREE.KeyframeTrack, "times" | "values"> {
  return trackWithLengths(keyframes, keyframes * valuesPerKey);
}

function trackWithLengths(
  keyframes: number,
  values: number,
): Pick<THREE.KeyframeTrack, "times" | "values"> {
  return {
    times: { length: keyframes },
    values: { length: values },
  } as unknown as Pick<THREE.KeyframeTrack, "times" | "values">;
}

function code(collections: Parameters<typeof assessThreeAnimationResourceTracks>[0]): string | undefined {
  return assessThreeAnimationResourceTracks(collections).diagnostics[0]?.code;
}

function cacheCode(
  added: Parameters<typeof extendThreeAnimationCacheBudget>[1],
  owner: Parameters<typeof extendThreeAnimationCacheBudget>[2],
): string | undefined {
  return extendThreeAnimationCacheBudget(
    EMPTY_THREE_ANIMATION_TRACK_COUNTS,
    added,
    owner,
  ).diagnostics[0]?.code;
}
