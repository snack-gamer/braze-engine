import { describe, expect, it } from "vitest";
import { makeObject } from "../lib/payload";
import { createAnimationEvaluationPlan } from "./evaluate";
import { evaluateObjectAtPlayback } from "./playback-evaluation";
import type { TransformAnimationTrack } from "./types";

describe("evaluateObjectAtPlayback", () => {
  it("samples the requested object at live playback time without mutating authored state", () => {
    const object = makeObject("cube", 0, {
      id: "animated-cube",
      animationPlayer: { enabled: true },
      position: [0, 0, 0],
    });
    const track: TransformAnimationTrack = {
      id: "position-track",
      kind: "transform",
      objectId: object.id,
      label: "Cube",
      enabled: true,
      channels: [{
        id: "position-x",
        property: "position",
        axis: 0,
        enabled: true,
        keys: [
          { id: "start", time: 0, value: 0, interpolation: "linear" },
          { id: "end", time: 1, value: 10, interpolation: "linear" },
        ],
      }],
      keyframes: [],
    };
    const objects = [object];
    const plan = createAnimationEvaluationPlan(objects, [track]);

    const evaluated = evaluateObjectAtPlayback(object, plan, 0.5);

    expect(evaluated?.position[0]).toBe(5);
    expect(object.position[0]).toBe(0);
    expect(evaluateObjectAtPlayback(undefined, plan, 0.5)).toBeUndefined();
  });
});
