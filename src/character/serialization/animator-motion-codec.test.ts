import { describe, expect, it } from "vitest";
import type { AnimatorMotion, BlendTree1D } from "../domain/blend-tree";
import { ANIMATOR_DOCUMENT_LIMITS } from "../domain/character-document-limits";
import { CharacterCodecError } from "./character-codec-values";
import { decodeAnimatorMotion, encodeAnimatorMotion } from "./animator-motion-codec";

const CLIP_REF = { guid: "abababababababababababababababab", localId: "clip" } as const;

describe("Animator motion codec", () => {
  it("round-trips a per-Clip loop override", () => {
    const motion: AnimatorMotion = { kind: "clip", clipRef: CLIP_REF, speed: 1, loopMode: "once" };
    expect(decodeAnimatorMotion(encodeAnimatorMotion(motion))).toEqual(motion);
    expect(decodeAnimatorMotion({
      kind: "clip",
      clip_ref: { guid: CLIP_REF.guid, local_id: CLIP_REF.localId },
      speed: 1,
      loop_mode: "loop",
    })).toMatchObject({ loopMode: "loop" });
  });

  it("round-trips nested 2D and 1D trees", () => {
    const clip = (): AnimatorMotion => ({ kind: "clip", clipRef: CLIP_REF, speed: 1 });
    const motion: AnimatorMotion = {
      kind: "blendTree",
      tree: {
        kind: "2dFreeformCartesian",
        parameterXId: "x",
        parameterYId: "y",
        children: [{
          id: "nested",
          position: [0, 0],
          timeScale: 1,
          mirror: false,
          motion: {
            kind: "blendTree",
            tree: {
              kind: "1d",
              parameterId: "speed",
              children: [
                { id: "idle", threshold: 0, motion: clip(), timeScale: 1, mirror: false },
                { id: "run", threshold: 1, motion: clip(), timeScale: 2, mirror: false },
              ],
            },
          },
        }],
      },
    };
    expect(decodeAnimatorMotion(encodeAnimatorMotion(motion))).toEqual(motion);
  });

  it("rejects cyclic authored and persisted motion graphs explicitly", () => {
    const tree: BlendTree1D = { kind: "1d", parameterId: "speed", children: [] };
    const motion: AnimatorMotion = { kind: "blendTree", tree };
    tree.children.push({ id: "cycle", threshold: 0, motion, timeScale: 1, mirror: false });
    expect(() => encodeAnimatorMotion(motion)).toThrowError(CharacterCodecError);
    try {
      encodeAnimatorMotion(motion);
    } catch (error) {
      expect(error).toMatchObject({ code: "invalid-topology" });
    }

    const persisted: Record<string, unknown> = {
      kind: "blendTree",
      tree: { kind: "1d", parameterId: "speed", children: [] },
    };
    const persistedTree = persisted.tree as { children: unknown[] };
    persistedTree.children.push({ id: "cycle", threshold: 0, timeScale: 1, motion: persisted });
    expect(() => decodeAnimatorMotion(persisted)).toThrowError(CharacterCodecError);
    try {
      decodeAnimatorMotion(persisted);
    } catch (error) {
      expect(error).toMatchObject({ code: "invalid-topology" });
    }
  });

  it("accepts the depth boundary and rejects max plus one", () => {
    const bounded = nestedMotion(ANIMATOR_DOCUMENT_LIMITS.blendTreeDepth);
    expect(decodeAnimatorMotion(encodeAnimatorMotion(bounded))).toEqual(bounded);
    const over = nestedMotion(ANIMATOR_DOCUMENT_LIMITS.blendTreeDepth + 1);
    expect(() => encodeAnimatorMotion(over)).toThrowError(/cannot exceed depth 8/);
    expect(() => decodeAnimatorMotion(persistedMotion(over))).toThrowError(/cannot exceed depth 8/);
  });

  it("bounds each child array and the total motion graph before further traversal", () => {
    const bounded = flatMotion(ANIMATOR_DOCUMENT_LIMITS.motionNodesPerState - 1);
    expect(decodeAnimatorMotion(encodeAnimatorMotion(bounded))).toEqual(bounded);

    const totalOver = flatMotion(ANIMATOR_DOCUMENT_LIMITS.motionNodesPerState);
    expect(() => encodeAnimatorMotion(totalOver)).toThrowError(/cannot exceed 256 nodes/);
    expect(() => decodeAnimatorMotion(persistedMotion(totalOver))).toThrowError(/cannot exceed 256 nodes/);

    const childArrayOver = flatMotion(ANIMATOR_DOCUMENT_LIMITS.blendTreeChildrenPerNode + 1);
    expect(() => encodeAnimatorMotion(childArrayOver)).toThrowError(/cannot exceed 256 entries/);
    expect(() => decodeAnimatorMotion(persistedMotion(childArrayOver))).toThrowError(/cannot exceed 256 entries/);
  });
});

function clipMotion(index = 0): AnimatorMotion {
  return { kind: "clip", clipRef: { ...CLIP_REF, localId: `clip-${index}` }, speed: 1 };
}

function flatMotion(childCount: number): AnimatorMotion {
  return {
    kind: "blendTree",
    tree: {
      kind: "1d",
      parameterId: "speed",
      children: Array.from({ length: childCount }, (_, index) => ({
        id: `child-${index}`,
        threshold: index,
        motion: clipMotion(index),
        timeScale: 1,
        mirror: false,
      })),
    },
  };
}

function nestedMotion(depth: number): AnimatorMotion {
  let motion = clipMotion();
  for (let index = 0; index < depth; index += 1) {
    motion = {
      kind: "blendTree",
      tree: {
        kind: "1d",
        parameterId: "speed",
        children: [{
          id: `depth-${index}`,
          threshold: 0,
          motion,
          timeScale: 1,
          mirror: false,
        }],
      },
    };
  }
  return motion;
}

function persistedMotion(motion: AnimatorMotion): unknown {
  return JSON.parse(JSON.stringify(encodeWithoutLimits(motion)));
}

function encodeWithoutLimits(motion: AnimatorMotion): unknown {
  if (motion.kind === "clip") return {
    kind: "clip",
    clipRef: motion.clipRef,
    speed: motion.speed,
  };
  const tree = motion.tree;
  return {
    kind: "blendTree",
    tree: {
      ...tree,
      children: tree.children.map((child) => ({
        ...child,
        motion: encodeWithoutLimits(child.motion),
      })),
    },
  };
}
