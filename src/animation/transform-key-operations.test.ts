import { describe, expect, it } from "vitest";
import type { SceneObject } from "../scene/domain/scene-object";
import {
  createAnimationDocument,
  findTransformTrack,
  setAnimationDuration,
  setAnimationPlayhead,
} from "./animation-document";
import {
  upsertTransformChannelKeyframe,
  upsertTransformKeyframe,
} from "./transform-key-authoring";
import {
  insertTransformChannelKeyframes,
  moveTransformKeyframesAtTime,
  removeTransformChannelKeyframes,
  setTransformChannelKeyframeTangent,
  updateTransformChannelKeyframes,
} from "./transform-key-editing";

function object(positionX = 0): SceneObject {
  return {
    id: "cube",
    name: "Cube",
    primitive: "cube",
    color: "#fff",
    visible: true,
    locked: false,
    position: [positionX, 2, 3],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  };
}

function positionXChannel(document: ReturnType<typeof createAnimationDocument>) {
  const track = findTransformTrack(document, "cube");
  if (!track) throw new Error("Expected cube transform track");
  const channel = track.channels.find((item) => item.property === "position" && item.axis === 0);
  if (!channel) throw new Error("Expected position X channel");
  return { track, channel };
}

describe("authored transform key operations", () => {
  it("creates all transform channels and snaps a full-object key", () => {
    const document = upsertTransformKeyframe(createAnimationDocument(), object(4), 0.51);
    const track = findTransformTrack(document, "cube");
    expect(track?.channels).toHaveLength(9);
    expect(track?.channels.every((channel) => channel.keys.length === 1)).toBe(true);
    expect(track?.channels[0].keys[0].time).toBe(0.5);
  });

  it("re-authoring a frame preserves key identity, interpolation, and tangents", () => {
    let document = upsertTransformChannelKeyframe(
      createAnimationDocument(),
      object(2),
      "position",
      0,
      1,
    );
    const original = positionXChannel(document);
    const key = original.channel.keys[0];
    document = setTransformChannelKeyframeTangent(
      document,
      original.track.id,
      original.channel.id,
      key.id,
      "out",
      3.5,
    );
    document = upsertTransformChannelKeyframe(document, object(8), "position", 0, 1.001);
    const replaced = positionXChannel(document).channel.keys[0];
    expect(replaced.id).toBe(key.id);
    expect(replaced.value).toBe(8);
    expect(replaced.interpolation).toBe("manual");
    expect(replaced.outTangent).toBe(3.5);
  });

  it("moving onto an occupied frame keeps the moved key", () => {
    let document = upsertTransformChannelKeyframe(
      createAnimationDocument(), object(1), "position", 0, 1,
    );
    document = upsertTransformChannelKeyframe(document, object(2), "position", 0, 2);
    const before = positionXChannel(document);
    const movedId = before.channel.keys.find((key) => key.time === 1)?.id;
    document = moveTransformKeyframesAtTime(document, { objectId: "cube" }, 1, 2);
    const keys = positionXChannel(document).channel.keys;
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatchObject({ id: movedId, time: 2, value: 1 });
  });

  it("bulk updates and inserts prefer edited keys during frame collisions", () => {
    let document = upsertTransformChannelKeyframe(
      createAnimationDocument(), object(1), "position", 0, 1,
    );
    document = upsertTransformChannelKeyframe(document, object(2), "position", 0, 2);
    let current = positionXChannel(document);
    const first = current.channel.keys[0];
    document = updateTransformChannelKeyframes(document, [{
      trackId: current.track.id,
      channelId: current.channel.id,
      keyframeId: first.id,
      time: 2,
      value: 7,
    }]);
    current = positionXChannel(document);
    expect(current.channel.keys).toHaveLength(1);
    expect(current.channel.keys[0]).toMatchObject({ id: first.id, time: 2, value: 7 });

    document = insertTransformChannelKeyframes(document, [{
      trackId: current.track.id,
      channelId: current.channel.id,
      keyframe: { id: "pasted", time: 2.001, value: 9, interpolation: "easeOut" },
    }]);
    expect(positionXChannel(document).channel.keys).toEqual([{
      id: "pasted",
      time: 2,
      value: 9,
      interpolation: "easeOut",
    }]);
  });

  it("removes empty transform tracks after a bulk delete", () => {
    let document = upsertTransformChannelKeyframe(
      createAnimationDocument(), object(1), "position", 0, 1,
    );
    const current = positionXChannel(document);
    document = removeTransformChannelKeyframes(document, [{
      trackId: current.track.id,
      channelId: current.channel.id,
      keyframeId: current.channel.keys[0].id,
    }]);
    expect(findTransformTrack(document, "cube")).toBeUndefined();
  });
});

describe("animation document timing", () => {
  it("snaps authored playheads, preserves unsnapped precision, and clamps duration", () => {
    const document = createAnimationDocument();
    expect(setAnimationPlayhead(document, 0.51).playhead).toBe(0.5);
    expect(setAnimationPlayhead(document, 0.51234567, { snap: false }).playhead).toBe(0.512346);
    const shortened = setAnimationDuration({ ...document, playhead: 4 }, 1);
    expect(shortened.duration).toBe(1);
    expect(shortened.playhead).toBe(1);
  });
});
