import {
  type CharacterRuntimeResult,
} from "../../runtime/diagnostics";
import {
  assessThreeAnimationResourceTracks,
  EMPTY_THREE_ANIMATION_TRACK_COUNTS,
  extendThreeAnimationCacheBudget,
  subtractThreeAnimationTrackCounts,
  type ThreeAnimationTrackCounts,
} from "./three-animation-resource-budget";
import type { ThreeAnimatorClipResource } from "./three-animator-clip-resource";

type CachedCanonicalResource = Readonly<{
  result: CharacterRuntimeResult<ThreeAnimatorClipResource>;
  counts: ThreeAnimationTrackCounts;
}>;

/** Keeps canonical clip clones bounded to the active/recent pose working set. */
export class ThreeCanonicalClipResourceCache {
  private readonly entries = new Map<object, CachedCanonicalResource>();
  private counts: ThreeAnimationTrackCounts = EMPTY_THREE_ANIMATION_TRACK_COUNTS;

  resolve(
    source: ThreeAnimatorClipResource,
    protectedSources: ReadonlySet<object>,
    compile: () => CharacterRuntimeResult<ThreeAnimatorClipResource>,
  ): CharacterRuntimeResult<ThreeAnimatorClipResource> {
    const key = source as object;
    const cached = this.entries.get(key);
    if (cached) {
      this.entries.delete(key);
      this.entries.set(key, cached);
      return cached.result;
    }
    let result = compile();
    let counts = EMPTY_THREE_ANIMATION_TRACK_COUNTS;
    if (result.value) {
      const assessed = assessThreeAnimationResourceTracks(
        result.value.bindings.map((binding) => binding.clip.tracks),
      );
      if (!assessed.value) result = { value: null, diagnostics: assessed.diagnostics };
      else {
        counts = assessed.value;
        let extended = extendThreeAnimationCacheBudget(this.counts, counts, "canonical");
        while (!extended.value && this.evictOldest(protectedSources)) {
          extended = extendThreeAnimationCacheBudget(this.counts, counts, "canonical");
        }
        // Aggregate pressure is transient: a later pose can protect a smaller
        // active set, so do not permanently memoize this failure by source.
        if (!extended.value) return { value: null, diagnostics: extended.diagnostics };
        else this.counts = extended.value;
      }
    }
    const entry = { result, counts: result.value ? counts : EMPTY_THREE_ANIMATION_TRACK_COUNTS };
    this.entries.set(key, entry);
    return result;
  }

  private evictOldest(protectedSources: ReadonlySet<object>): boolean {
    for (const [source, entry] of this.entries) {
      if (protectedSources.has(source)) continue;
      this.entries.delete(source);
      this.counts = subtractThreeAnimationTrackCounts(this.counts, entry.counts);
      return true;
    }
    return false;
  }
}
