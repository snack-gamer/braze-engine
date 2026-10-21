import type { SceneObject } from "../../types";
import { AXIS_LABELS, ensureTransformChannels, transformValue } from "../channels";
import type { AnimatableObjectRow } from "../scope";
import type { TransformAnimationTrack, TransformChannelKeyframeRef, TransformProperty } from "../types";
import { keyRefId, uniqueTimes } from "./keyframes";
import type { TimelineKeyEntry, TimelineRow } from "./types";

const PROPERTY_LABELS: Record<TransformProperty, string> = {
  position: "Position",
  rotation: "Rotation",
  scale: "Scale",
};

export function collectTimelineKeyEntries(transformTracks: TransformAnimationTrack[]): TimelineKeyEntry[] {
  return transformTracks.flatMap((track) =>
    track.channels.flatMap((channel) =>
      channel.keys.map((key) => {
        const ref: TransformChannelKeyframeRef = {
          trackId: track.id,
          channelId: channel.id,
          keyframeId: key.id,
        };
        return {
          id: keyRefId(ref),
          ref,
          objectId: track.objectId,
          property: channel.property,
          axis: channel.axis,
          key,
        };
      }),
    ),
  );
}

export function buildTimelineRows(
  animatableRows: AnimatableObjectRow[],
  evaluatedObjects: SceneObject[],
  transformTracks: TransformAnimationTrack[],
): TimelineRow[] {
  const evaluatedObjectById = new Map(evaluatedObjects.map((object) => [object.id, object]));
  const tracksByObject = new Map(transformTracks.map((track) => [track.objectId, track]));
  return animatableRows.flatMap(({ object, depth }) => {
    const valueSource = evaluatedObjectById.get(object.id) ?? object;
    const track = tracksByObject.get(object.id);
    const channels = ensureTransformChannels(object, track?.channels, track?.keyframes);
    const channelRows = channels.map((channel): TimelineRow => ({
      id: `channel:${object.id}:${channel.property}:${channel.axis}`,
      kind: "channel",
      objectId: object.id,
      label: AXIS_LABELS[channel.axis],
      depth: depth + 2,
      property: channel.property,
      axis: channel.axis,
      channel,
      keys: channel.keys.map((key) => ({
        id: key.id,
        time: key.time,
        value: key.value,
        interpolation: key.interpolation,
      })),
      value: transformValue(valueSource, channel.property, channel.axis),
    }));
    const propertyRows = (["position", "rotation", "scale"] as TransformProperty[]).map(
      (property): TimelineRow => ({
        id: `property:${object.id}:${property}`,
        kind: "property",
        objectId: object.id,
        label: PROPERTY_LABELS[property],
        depth: depth + 1,
        property,
        keys: uniqueTimes(channelRows.filter((row) => row.property === property).flatMap((row) => row.keys)),
      }),
    );
    return [
      {
        id: `object:${object.id}`,
        kind: "object" as const,
        objectId: object.id,
        label: object.name || "(unnamed)",
        depth,
        keys: uniqueTimes(channelRows.flatMap((row) => row.keys)),
      },
      ...propertyRows.flatMap((propertyRow) => [
        propertyRow,
        ...channelRows.filter((row) => row.property === propertyRow.property),
      ]),
    ];
  });
}

export function visibleTimelineRows(rows: TimelineRow[], expandedRows: ReadonlySet<string>): TimelineRow[] {
  return rows.filter((row) => {
    if (row.kind === "object") return true;
    if (row.kind === "property") return expandedRows.has(`object:${row.objectId}`);
    return Boolean(
      row.property
      && expandedRows.has(`object:${row.objectId}`)
      && expandedRows.has(`property:${row.objectId}:${row.property}`),
    );
  });
}
