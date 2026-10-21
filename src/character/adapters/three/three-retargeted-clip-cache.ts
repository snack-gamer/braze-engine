import type * as THREE from "three";
import {
  characterRuntimeSuccess,
  type CharacterRuntimeResult,
} from "../../runtime/diagnostics";
import { THREE_RETARGET_WORK_LIMITS } from "./three-retarget-work-budget";

export const THREE_RETARGETED_CLIP_CACHE_LIMITS = Object.freeze({
  maximumEntries: 64,
  maximumClipsPerEntry: THREE_RETARGET_WORK_LIMITS.maximumTargetSkeletons,
  maximumTracksPerEntry: THREE_RETARGET_WORK_LIMITS.maximumTargetSkeletons
    * (THREE_RETARGET_WORK_LIMITS.maximumMappedBones
      + THREE_RETARGET_WORK_LIMITS.maximumTwistHelperBones + 1),
  maximumEntryTypedArrayBytes: THREE_RETARGET_WORK_LIMITS.maximumOutputTypedArrayBytes,
  maximumTotalTypedArrayBytes: 32 * 1_024 * 1_024,
});

export type ThreeRetargetedClipCacheWrite = Readonly<{
  retained: boolean;
  typedArrayBytes: number | null;
}>;

type ThreeRetargetedClipCacheEntry = Readonly<{
  clips: readonly THREE.AnimationClip[];
  typedArrayBytes: number;
}>;

const clipsByKey = new Map<string, ThreeRetargetedClipCacheEntry>();
let retainedTypedArrayBytes = 0;

/** Bounded process cache for immutable baked clips; target object bindings are never retained. */
export function cachedThreeRetargetedClips(
  key: string,
): readonly THREE.AnimationClip[] | undefined {
  const entry = clipsByKey.get(key);
  if (!entry) return undefined;
  clipsByKey.delete(key);
  clipsByKey.set(key, entry);
  return entry.clips;
}

export function cacheThreeRetargetedClips(
  key: string,
  clips: readonly THREE.AnimationClip[],
): CharacterRuntimeResult<ThreeRetargetedClipCacheWrite> {
  const measurement = measureClipSetTypedArrayBytes(clips);
  deleteEntry(key);
  if (!measurement.value) return characterRuntimeSuccess({
    retained: false,
    typedArrayBytes: measurement.typedArrayBytes,
  }, [{
    code: measurement.code,
    severity: "warning",
    message: measurement.message,
  }]);
  const typedArrayBytes = measurement.typedArrayBytes;
  if (typedArrayBytes > THREE_RETARGETED_CLIP_CACHE_LIMITS.maximumEntryTypedArrayBytes) {
    return characterRuntimeSuccess({ retained: false, typedArrayBytes }, [{
      code: "retarget-cache-entry-byte-limit-exceeded",
      severity: "warning",
      message: `Retargeted clip uses ${typedArrayBytes} typed-array bytes and was not retained by the ${THREE_RETARGETED_CLIP_CACHE_LIMITS.maximumEntryTypedArrayBytes}-byte per-entry cache.`,
      details: {
        measuredBytes: typedArrayBytes,
        maximumEntryBytes: THREE_RETARGETED_CLIP_CACHE_LIMITS.maximumEntryTypedArrayBytes,
      },
    }]);
  }
  while (clipsByKey.size >= THREE_RETARGETED_CLIP_CACHE_LIMITS.maximumEntries
    || retainedTypedArrayBytes + typedArrayBytes
      > THREE_RETARGETED_CLIP_CACHE_LIMITS.maximumTotalTypedArrayBytes) {
    const oldest = clipsByKey.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    deleteEntry(oldest);
  }
  clipsByKey.set(key, { clips, typedArrayBytes });
  retainedTypedArrayBytes += typedArrayBytes;
  return characterRuntimeSuccess({ retained: true, typedArrayBytes });
}

export function threeRetargetedClipCacheSize(): number {
  return clipsByKey.size;
}

export function threeRetargetedClipCacheBytes(): number {
  return retainedTypedArrayBytes;
}

export function clearThreeRetargetedClipCacheForTests(): void {
  clipsByKey.clear();
  retainedTypedArrayBytes = 0;
}

type ClipSetByteMeasurement = Readonly<{
  value: true;
  typedArrayBytes: number;
  code: "";
  message: "";
}> | Readonly<{
  value: false;
  typedArrayBytes: null;
  code: string;
  message: string;
}>;

function measureClipSetTypedArrayBytes(
  clips: readonly THREE.AnimationClip[],
): ClipSetByteMeasurement {
  const limits = THREE_RETARGETED_CLIP_CACHE_LIMITS;
  if (clips.length > limits.maximumClipsPerEntry) return invalidMeasurement(
    "retarget-cache-entry-shape-limit-exceeded",
    `Retargeted clip set exceeds the ${limits.maximumClipsPerEntry}-clip cache-entry limit.`,
  );
  const buffers = new Set<ArrayBufferLike>();
  let trackCount = 0;
  try {
    for (const clip of clips) {
      trackCount += clip.tracks.length;
      if (trackCount > limits.maximumTracksPerEntry) return invalidMeasurement(
        "retarget-cache-entry-shape-limit-exceeded",
        `Retargeted clip set exceeds the ${limits.maximumTracksPerEntry}-track cache-entry limit.`,
      );
      for (const track of clip.tracks) {
        for (const storage of [track.times, track.values]) {
          if (!ArrayBuffer.isView(storage)) return invalidMeasurement(
            "retarget-cache-track-storage-unsupported",
            "Retargeted clip track storage is not a typed-array view and was not retained.",
          );
          buffers.add(storage.buffer);
        }
      }
    }
  } catch {
    return invalidMeasurement(
      "retarget-cache-track-storage-unsupported",
      "Retargeted clip track storage could not be measured and was not retained.",
    );
  }
  let typedArrayBytes = 0;
  for (const buffer of buffers) {
    typedArrayBytes += buffer.byteLength;
    if (!Number.isSafeInteger(typedArrayBytes)) return invalidMeasurement(
      "retarget-cache-track-storage-unsupported",
      "Retargeted clip track storage has an unsafe byte length and was not retained.",
    );
  }
  return { value: true, typedArrayBytes, code: "", message: "" };
}

function invalidMeasurement(code: string, message: string): ClipSetByteMeasurement {
  return { value: false, typedArrayBytes: null, code, message };
}

function deleteEntry(key: string): void {
  const entry = clipsByKey.get(key);
  if (!entry) return;
  clipsByKey.delete(key);
  retainedTypedArrayBytes -= entry.typedArrayBytes;
}
