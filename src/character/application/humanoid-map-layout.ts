import type { HumanoidBoneName } from "../domain/humanoid-avatar";

export type HumanoidMappingRegion = "body" | "head" | "leftHand" | "rightHand";

export const HUMANOID_MAPPING_REGIONS: ReadonlyArray<Readonly<{
  id: HumanoidMappingRegion;
  label: string;
}>> = [
  { id: "body", label: "Body" },
  { id: "head", label: "Head" },
  { id: "leftHand", label: "Left Hand" },
  { id: "rightHand", label: "Right Hand" },
];

export type HumanoidMapPoint = Readonly<{
  bone: HumanoidBoneName;
  x: number;
  y: number;
  markerSize?: number;
}>;

export type HumanoidMapRegionLayout = Readonly<{
  viewBox: string;
  markerSize: number;
  points: readonly HumanoidMapPoint[];
}>;

type MapPointTuple = readonly [HumanoidBoneName, number, number, number?];

const BODY_POINTS = mapPoints([
  ["head", 311, 62],
  ["neck", 311, 173, 20],
  ["upperChest", 311, 222, 20],
  ["chest", 311, 255],
  ["spine", 311, 385, 20],
  ["hips", 311, 509, 28],
  ["leftShoulder", 267, 185, 20],
  ["leftUpperArm", 239, 218],
  ["leftLowerArm", 191, 358],
  ["leftHand", 149, 499],
  ["rightShoulder", 355, 185, 20],
  ["rightUpperArm", 383, 218],
  ["rightLowerArm", 431, 358],
  ["rightHand", 473, 499],
  ["leftUpperLeg", 271, 509],
  ["leftLowerLeg", 259, 719],
  ["leftFoot", 254, 925],
  ["leftToes", 238, 982, 20],
  ["rightUpperLeg", 351, 509],
  ["rightLowerLeg", 363, 719],
  ["rightFoot", 368, 925],
  ["rightToes", 384, 982, 20],
] satisfies readonly MapPointTuple[]);

const HEAD_POINTS = mapPoints([
  ["head", 311, 62],
  ["leftEye", 292, 83],
  ["rightEye", 330, 83],
  ["jaw", 311, 132],
  ["neck", 311, 173],
] satisfies readonly MapPointTuple[]);

const HAND_POINT_DATA = [
  ["Hand", 149, 499],
  ["ThumbProximal", 128, 518],
  ["ThumbIntermediate", 115, 531],
  ["ThumbDistal", 100, 538],
  ["IndexProximal", 135, 540],
  ["IndexIntermediate", 135, 559],
  ["IndexDistal", 133, 576],
  ["MiddleProximal", 146, 541],
  ["MiddleIntermediate", 146, 565],
  ["MiddleDistal", 144, 585],
  ["RingProximal", 156, 538],
  ["RingIntermediate", 158, 561],
  ["RingDistal", 156, 580],
  ["LittleProximal", 165, 533],
  ["LittleIntermediate", 167, 552],
  ["LittleDistal", 165, 568],
] as const;

function mapPoints(data: readonly MapPointTuple[]): readonly HumanoidMapPoint[] {
  return data.map(([bone, x, y, markerSize]) => markerSize === undefined
    ? { bone, x, y }
    : { bone, x, y, markerSize });
}

function handPoints(side: "left" | "right"): readonly HumanoidMapPoint[] {
  return HAND_POINT_DATA.map(([name, leftX, y]) => ({
    bone: `${side}${name}` as HumanoidBoneName,
    x: side === "left" ? leftX : 622 - leftX,
    y,
  }));
}

const LEFT_HAND_POINTS = handPoints("left");
const RIGHT_HAND_POINTS = handPoints("right");

export const HUMANOID_REGION_SLOTS: Readonly<Record<HumanoidMappingRegion, readonly HumanoidBoneName[]>> = {
  body: bones(BODY_POINTS),
  head: bones(HEAD_POINTS),
  leftHand: bones(LEFT_HAND_POINTS),
  rightHand: bones(RIGHT_HAND_POINTS),
};

function bones(points: readonly HumanoidMapPoint[]): readonly HumanoidBoneName[] {
  return points.map((point) => point.bone);
}

export const HUMANOID_MAP_LAYOUTS: Readonly<Record<HumanoidMappingRegion, HumanoidMapRegionLayout>> = {
  body: { viewBox: "0 0 610 1024", markerSize: 40, points: BODY_POINTS },
  head: { viewBox: "195 20 232 190", markerSize: 16, points: HEAD_POINTS },
  leftHand: { viewBox: "82 454 96 150", markerSize: 9, points: LEFT_HAND_POINTS },
  rightHand: { viewBox: "444 454 96 150", markerSize: 9, points: RIGHT_HAND_POINTS },
};
