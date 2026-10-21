import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cacheThreeRetargetedClips,
  cachedThreeRetargetedClips,
  clearThreeRetargetedClipCacheForTests,
  THREE_RETARGETED_CLIP_CACHE_LIMITS,
  threeRetargetedClipCacheBytes,
  threeRetargetedClipCacheSize,
} from "./three-retargeted-clip-cache";

describe("Three retargeted clip cache", () => {
  beforeEach(clearThreeRetargetedClipCacheForTests);
  afterEach(clearThreeRetargetedClipCacheForTests);

  it("keeps 64 clip sets and evicts the least-recently-used key", () => {
    const clips = Array.from({ length: 65 }, (_, index) => [
      new THREE.AnimationClip(`Clip ${index}`, 1, []),
    ] as const);
    for (let index = 0; index < 64; index += 1) {
      cacheThreeRetargetedClips(`key:${index}`, clips[index]!);
    }
    expect(threeRetargetedClipCacheSize()).toBe(64);

    expect(cachedThreeRetargetedClips("key:0")).toBe(clips[0]);
    cacheThreeRetargetedClips("key:64", clips[64]!);

    expect(threeRetargetedClipCacheSize()).toBe(64);
    expect(cachedThreeRetargetedClips("key:0")).toBe(clips[0]);
    expect(cachedThreeRetargetedClips("key:1")).toBeUndefined();
    expect(cachedThreeRetargetedClips("key:64")).toBe(clips[64]);
  });

  it("replaces an existing key without consuming another slot", () => {
    const first = clipSetWithBytes("First", 2 * 1_024 * 1_024);
    const replacement = clipSetWithBytes("Replacement", 3 * 1_024 * 1_024);

    cacheThreeRetargetedClips("same", first);
    cacheThreeRetargetedClips("same", replacement);

    expect(threeRetargetedClipCacheSize()).toBe(1);
    expect(threeRetargetedClipCacheBytes()).toBe(3 * 1_024 * 1_024);
    expect(cachedThreeRetargetedClips("same")).toBe(replacement);
  });

  it("evicts least-recently-used entries by retained typed-array bytes", () => {
    const bytesPerEntry = 6 * 1_024 * 1_024;
    const clips = Array.from({ length: 6 }, (_, index) => (
      clipSetWithBytes(`Weighted ${index}`, bytesPerEntry)
    ));
    for (let index = 0; index < 5; index += 1) {
      expect(cacheThreeRetargetedClips(`weighted:${index}`, clips[index]!).value?.retained).toBe(true);
    }
    expect(threeRetargetedClipCacheBytes()).toBe(30 * 1_024 * 1_024);

    expect(cachedThreeRetargetedClips("weighted:0")).toBe(clips[0]);
    cacheThreeRetargetedClips("weighted:5", clips[5]!);

    expect(threeRetargetedClipCacheSize()).toBe(5);
    expect(threeRetargetedClipCacheBytes()).toBe(30 * 1_024 * 1_024);
    expect(cachedThreeRetargetedClips("weighted:0")).toBe(clips[0]);
    expect(cachedThreeRetargetedClips("weighted:1")).toBeUndefined();
    expect(cachedThreeRetargetedClips("weighted:5")).toBe(clips[5]);
  });

  it("does not retain an oversized replacement or leave its stale key behind", () => {
    const exact = cacheThreeRetargetedClips("same", clipSetWithBytes(
      "Exact boundary",
      THREE_RETARGETED_CLIP_CACHE_LIMITS.maximumEntryTypedArrayBytes,
    ));
    expect(exact.value?.retained).toBe(true);
    expect(threeRetargetedClipCacheBytes())
      .toBe(THREE_RETARGETED_CLIP_CACHE_LIMITS.maximumEntryTypedArrayBytes);

    const oversized = cacheThreeRetargetedClips("same", clipSetWithBytes(
      "Oversized",
      THREE_RETARGETED_CLIP_CACHE_LIMITS.maximumEntryTypedArrayBytes + 4,
    ));

    expect(oversized.value).toEqual({
      retained: false,
      typedArrayBytes: THREE_RETARGETED_CLIP_CACHE_LIMITS.maximumEntryTypedArrayBytes + 4,
    });
    expect(oversized.diagnostics[0]?.code).toBe("retarget-cache-entry-byte-limit-exceeded");
    expect(cachedThreeRetargetedClips("same")).toBeUndefined();
    expect(threeRetargetedClipCacheSize()).toBe(0);
    expect(threeRetargetedClipCacheBytes()).toBe(0);
  });
});

function clipSetWithBytes(name: string, byteLength: number): readonly THREE.AnimationClip[] {
  const buffer = new ArrayBuffer(byteLength);
  const track = {
    times: new Float32Array(buffer, 0, 0),
    values: new Float32Array(buffer),
  } as THREE.KeyframeTrack;
  return [{ name, tracks: [track] } as THREE.AnimationClip];
}
