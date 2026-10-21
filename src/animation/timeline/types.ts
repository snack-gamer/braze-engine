import type {
  CurveInterpolation,
  TransformAxis,
  TransformChannel,
  TransformChannelKeyframeRef,
  TransformProperty,
} from "../types";

export type ViewMode = "dopesheet" | "curves";
export type TimelineRowKind = "object" | "property" | "channel";

export type TimelineKey = {
  id: string;
  time: number;
  value?: number;
  interpolation: CurveInterpolation;
};

export type TimelineRow = {
  id: string;
  kind: TimelineRowKind;
  objectId: string;
  label: string;
  depth: number;
  property?: TransformProperty;
  axis?: TransformAxis;
  channel?: TransformChannel;
  keys: TimelineKey[];
  value?: number;
};

export type CurveViewport = {
  minValue: number;
  maxValue: number;
};

export type LassoRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type TimelineKeyMarker = {
  rowId: string;
  rowIndex: number;
  time: number;
  value?: number;
  refs: TransformChannelKeyframeRef[];
  xPercent: number;
  yPercent?: number;
};

export type TimelineKeyEntry = {
  id: string;
  ref: TransformChannelKeyframeRef;
  objectId: string;
  property: TransformProperty;
  axis: TransformAxis;
  key: TransformChannel["keys"][number];
};
