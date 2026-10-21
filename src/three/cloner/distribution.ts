import type { ClonerSettings } from "../../types";
import {
  axisCorrection,
  eulerQuat,
  qmul,
  qnormalize,
  qrot,
  quatFromBasis,
  type V3,
  type V4,
} from "../braze-effectors";
import { clonerRandomSigned } from "./random";

const DEG = Math.PI / 180;
const TWO_PI = Math.PI * 2;

export function radialRingSize(cloner: ClonerSettings, ring: number): number {
  return Math.max(1, cloner.count + ring * cloner.radialCountStep);
}

export function radialRingStart(cloner: ClonerSettings, ring: number): number {
  if (ring <= 0) return 0;
  const pairs = (ring * (ring - 1)) / 2;
  return ring * cloner.count + pairs * cloner.radialCountStep;
}

export function radialDecode(
  cloner: ClonerSettings,
  index: number,
): { ring: number; segment: number; segments: number; start: number } {
  const ringCount = Math.max(1, cloner.radialRings);
  let ring = 0;
  if (cloner.radialCountStep === 0) {
    ring = Math.min(Math.floor(index / Math.max(1, cloner.count)), ringCount - 1);
  } else {
    const stepValue = cloner.radialCountStep;
    const linearValue = cloner.count - stepValue * 0.5;
    const root = (-linearValue + Math.sqrt(Math.max(0, linearValue * linearValue + 2 * stepValue * index))) / stepValue;
    ring = Math.min(Math.floor(Math.max(0, root)), ringCount - 1);
    const estimatedStart = radialRingStart(cloner, ring);
    if (estimatedStart > index && ring > 0) ring -= 1;
    else if (ring + 1 < ringCount && radialRingStart(cloner, ring + 1) <= index) ring += 1;
  }
  const start = radialRingStart(cloner, ring);
  const segments = radialRingSize(cloner, ring);
  const segment = Math.min(index - start, segments - 1);
  return { ring, segment, segments, start };
}

function radialArcRadians(cloner: ClonerSettings): [number, number] {
  return [cloner.startAngle * DEG, (cloner.startAngle + cloner.arc) * DEG];
}

export function radialArcClosed(cloner: ClonerSettings): boolean {
  const [a, b] = radialArcRadians(cloner);
  return Math.abs(Math.abs(b - a) - TWO_PI) <= 0.0002;
}

export function radialPathU(segment: number, segments: number, closed: boolean): number {
  if (segments <= 1) return 0;
  return closed ? segment / segments : segment / (segments - 1);
}

export function radialSegmentAtU(u: number, segments: number, closed: boolean): number {
  if (segments <= 1) return 0;
  const clamped = Math.min(1, Math.max(0, u));
  return closed
    ? Math.round(clamped * segments) % segments
    : Math.min(Math.round(clamped * (segments - 1)), segments - 1);
}

type RadialTransform = {
  position: V3;
  pathDirection: V3;
  outwardDirection: V3;
  automaticUp: V3;
  wavePhase: number;
};

function radialTransform(cloner: ClonerSettings, ring: number, u: number): RadialTransform {
  const [arcStart, arcEnd] = radialArcRadians(cloner);
  const angle = arcStart + (arcEnd - arcStart) * u + ring * cloner.radialRingTwist * DEG;
  const wavePhase = u * cloner.radialWaveCycles * TWO_PI + cloner.radialWavePhase * DEG + ring * cloner.radialWaveRingPhase * DEG;
  const radius = cloner.radius + ring * cloner.radialRadiusStep + u * cloner.radialSpiralRadius + Math.sin(wavePhase) * cloner.radialWaveRadius;
  const ringCount = Math.max(1, cloner.radialRings);
  const ringCoordinate = cloner.radialCenterAxis ? ring - (ringCount - 1) * 0.5 : ring;
  const pathCoordinate = cloner.radialCenterAxis ? u - 0.5 : u;
  const axialPhase = cloner.radialWaveAxialPhase * DEG;
  const axisPosition = ringCoordinate * cloner.radialAxisStep + pathCoordinate * cloner.radialSpiralAxis + Math.sin(wavePhase + axialPhase) * cloner.radialWaveAxis;

  const angleDerivative = arcEnd - arcStart;
  const waveDerivative = cloner.radialWaveCycles * TWO_PI;
  const radiusDerivative = cloner.radialSpiralRadius + Math.cos(wavePhase) * waveDerivative * cloner.radialWaveRadius;
  const axisDerivative = cloner.radialSpiralAxis + Math.cos(wavePhase + axialPhase) * waveDerivative * cloner.radialWaveAxis;
  const s = Math.sin(angle);
  const c = Math.cos(angle);
  const radialX = c * radius;
  const radialY = s * radius;
  const tangentX = c * radiusDerivative - s * radius * angleDerivative;
  const tangentY = s * radiusDerivative + c * radius * angleDerivative;

  if (cloner.radialPlane === "xy") {
    return {
      position: [radialX, radialY, axisPosition],
      pathDirection: [tangentX, tangentY, axisDerivative],
      outwardDirection: [radialX, radialY, 0],
      automaticUp: [0, 0, 1],
      wavePhase,
    };
  }
  if (cloner.radialPlane === "xz") {
    return {
      position: [radialX, axisPosition, radialY],
      pathDirection: [tangentX, axisDerivative, tangentY],
      outwardDirection: [radialX, 0, radialY],
      automaticUp: [0, 1, 0],
      wavePhase,
    };
  }
  return {
    position: [axisPosition, radialX, radialY],
    pathDirection: [axisDerivative, tangentX, tangentY],
    outwardDirection: [0, radialX, radialY],
    automaticUp: [1, 0, 0],
    wavePhase,
  };
}

const ALIGNMENT_INDEX: Record<ClonerSettings["alignment"], number> = {
  default: 0,
  none: 1,
  path: 2,
  outward: 3,
  inward: 4,
};

const ALIGNMENT_AXIS_INDEX: Record<ClonerSettings["alignmentAxis"], number> = {
  "+z": 0,
  "-z": 1,
  "+y": 2,
  "-y": 3,
  "+x": 4,
  "-x": 5,
};

function safeNormalize(value: V3, fallback: V3): V3 {
  const sq = value[0] * value[0] + value[1] * value[1] + value[2] * value[2];
  if (sq <= 1e-10) return [...fallback] as V3;
  const inv = 1 / Math.sqrt(sq);
  return [value[0] * inv, value[1] * inv, value[2] * inv];
}

function alignmentRotation(cloner: ClonerSettings, direction: V3, automaticUp: V3): V4 {
  const dir = safeNormalize(direction, [0, 0, 1]);
  let up: V3 = automaticUp;
  if (cloner.alignmentUp === "x") up = [1, 0, 0];
  else if (cloner.alignmentUp === "y") up = [0, 1, 0];
  else if (cloner.alignmentUp === "z") up = [0, 0, 1];

  let dotUp = up[0] * dir[0] + up[1] * dir[1] + up[2] * dir[2];
  up = [up[0] - dir[0] * dotUp, up[1] - dir[1] * dotUp, up[2] - dir[2] * dotUp];
  if (up[0] * up[0] + up[1] * up[1] + up[2] * up[2] <= 1e-8) {
    up = Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [0, 0, 1];
    dotUp = up[0] * dir[0] + up[1] * dir[1] + up[2] * dir[2];
    up = [up[0] - dir[0] * dotUp, up[1] - dir[1] * dotUp, up[2] - dir[2] * dotUp];
  }
  up = safeNormalize(up, [0, 1, 0]);
  const right = safeNormalize(
    [up[1] * dir[2] - up[2] * dir[1], up[2] * dir[0] - up[0] * dir[2], up[0] * dir[1] - up[1] * dir[0]],
    [1, 0, 0],
  );
  const stableUp: V3 = [
    dir[1] * right[2] - dir[2] * right[1],
    dir[2] * right[0] - dir[0] * right[2],
    dir[0] * right[1] - dir[1] * right[0],
  ];
  return qnormalize(qmul(quatFromBasis(right, stableUp, dir), axisCorrection(ALIGNMENT_AXIS_INDEX[cloner.alignmentAxis])));
}

export type LocalTransform = { position: V3; rotation: V4; scale: V3 };

export function distributionTransform(cloner: ClonerSettings, index: number, total: number): LocalTransform {
  let position: V3 = [0, 0, 0];
  let rotation: V4 = [0, 0, 0, 1];
  let scale: V3 = [1, 1, 1];
  let pathDirection: V3 = [0, 0, 1];
  let outwardDirection: V3 = pathDirection;
  let automaticUp: V3 = [0, 1, 0];
  let layoutRotation: V4 = [0, 0, 0, 1];

  if (cloner.mode === "grid") {
    const nx = Math.max(1, Math.round(cloner.gridCount[0]));
    const ny = Math.max(1, Math.round(cloner.gridCount[1]));
    const gx = index % nx;
    const gy = Math.floor(index / nx) % ny;
    const gz = Math.floor(index / (nx * ny));
    const spacing = cloner.gridSpacing;
    const nz = Math.max(1, Math.round(cloner.gridCount[2]));
    const gridCentre: V3 = [((nx - 1) * spacing[0]) / 2, ((ny - 1) * spacing[1]) / 2, ((nz - 1) * spacing[2]) / 2];
    position = [gx * spacing[0], gy * spacing[1], gz * spacing[2]];
    outwardDirection = [position[0] - gridCentre[0], position[1] - gridCentre[1], position[2] - gridCentre[2]];
    if (cloner.gridCenter) position = [...outwardDirection] as V3;
    if (nx > 1 && Math.abs(spacing[0]) > 1e-6) pathDirection = [Math.sign(spacing[0]), 0, 0];
    else if (ny > 1 && Math.abs(spacing[1]) > 1e-6) pathDirection = [0, Math.sign(spacing[1]), 0];
    else if (nz > 1 && Math.abs(spacing[2]) > 1e-6) pathDirection = [0, 0, Math.sign(spacing[2])];
  } else if (cloner.mode === "linear") {
    const u = total > 1 ? index / (total - 1) : 0;
    const offset = cloner.linearStep;
    position = [offset[0] * index, offset[1] * index, offset[2] * index];
    pathDirection = safeNormalize([...offset] as V3, [0, 0, 1]);
    const half = (Math.max(1, total) - 1) * 0.5;
    outwardDirection = [position[0] - offset[0] * half, position[1] - offset[1] * half, position[2] - offset[2] * half];
    layoutRotation = eulerQuat([
      cloner.linearRotation[0] * DEG * index,
      cloner.linearRotation[1] * DEG * index,
      cloner.linearRotation[2] * DEG * index,
    ]);
    scale = [
      1 + (cloner.linearScale[0] - 1) * u,
      1 + (cloner.linearScale[1] - 1) * u,
      1 + (cloner.linearScale[2] - 1) * u,
    ];
  } else {
    const { ring, segment, segments } = radialDecode(cloner, index);
    const closed = radialArcClosed(cloner);
    const u = radialPathU(segment, segments, closed);
    const radial = radialTransform(cloner, ring, u);
    position = radial.position;
    pathDirection = radial.pathDirection;
    outwardDirection = radial.outwardDirection;
    automaticUp = radial.automaticUp;
    layoutRotation = eulerQuat([
      (cloner.radialRotationOffset[0] + ring * cloner.radialRotationStep[0]) * DEG,
      (cloner.radialRotationOffset[1] + ring * cloner.radialRotationStep[1]) * DEG,
      (cloner.radialRotationOffset[2] + ring * cloner.radialRotationStep[2]) * DEG,
    ]);
    const uniformScale = Math.max(0.001, 1 + ring * cloner.radialScaleStep + Math.sin(radial.wavePhase) * cloner.radialScaleWave);
    scale = [scale[0] * uniformScale, scale[1] * uniformScale, scale[2] * uniformScale];
  }

  const alignmentIndex = ALIGNMENT_INDEX[cloner.alignment];
  const resolvedAlignment = alignmentIndex === 0 ? (cloner.mode === "radial" ? 2 : 1) : alignmentIndex;
  if (resolvedAlignment !== 1) {
    let direction: V3 = resolvedAlignment === 2 ? pathDirection : outwardDirection;
    if (resolvedAlignment === 4) direction = [-direction[0], -direction[1], -direction[2]];
    direction = safeNormalize(direction, pathDirection);
    rotation = alignmentRotation(cloner, direction, automaticUp);
  }
  rotation = qnormalize(qmul(rotation, layoutRotation));
  scale = [scale[0] * cloner.uniformScale, scale[1] * cloner.uniformScale, scale[2] * cloner.uniformScale];
  return { position, rotation, scale };
}

export function applyLegacyCloneAdjustments(cloner: ClonerSettings, index: number, transform: LocalTransform): void {
  const jitterRot: V3 = [
    (cloner.cloneRotation[0] + clonerRandomSigned(cloner.seed + index * 67 + 11) * cloner.jitterRotation[0]) * DEG,
    (cloner.cloneRotation[1] + clonerRandomSigned(cloner.seed + index * 67 + 12) * cloner.jitterRotation[1]) * DEG,
    (cloner.cloneRotation[2] + clonerRandomSigned(cloner.seed + index * 67 + 13) * cloner.jitterRotation[2]) * DEG,
  ];
  if (jitterRot[0] !== 0 || jitterRot[1] !== 0 || jitterRot[2] !== 0) {
    transform.rotation = qnormalize(qmul(transform.rotation, eulerQuat(jitterRot)));
  }
  if (cloner.clonePosition[0] !== 0 || cloner.clonePosition[1] !== 0 || cloner.clonePosition[2] !== 0) {
    const local = qrot(transform.rotation, [...cloner.clonePosition] as V3);
    transform.position = [transform.position[0] + local[0], transform.position[1] + local[1], transform.position[2] + local[2]];
  }
  transform.position = [
    transform.position[0] + clonerRandomSigned(cloner.seed + index * 59 + 7) * cloner.jitterPosition[0],
    transform.position[1] + clonerRandomSigned(cloner.seed + index * 59 + 8) * cloner.jitterPosition[1],
    transform.position[2] + clonerRandomSigned(cloner.seed + index * 59 + 9) * cloner.jitterPosition[2],
  ];
  transform.scale = [
    transform.scale[0] * cloner.cloneScale[0] * (1 + clonerRandomSigned(cloner.seed + index * 71 + 17) * cloner.jitterScale[0]),
    transform.scale[1] * cloner.cloneScale[1] * (1 + clonerRandomSigned(cloner.seed + index * 71 + 18) * cloner.jitterScale[1]),
    transform.scale[2] * cloner.cloneScale[2] * (1 + clonerRandomSigned(cloner.seed + index * 71 + 19) * cloner.jitterScale[2]),
  ];
}

export function cloneCount(cloner: ClonerSettings): number {
  if (cloner.mode === "grid") {
    return Math.max(1, Math.round(cloner.gridCount[0])) *
      Math.max(1, Math.round(cloner.gridCount[1])) *
      Math.max(1, Math.round(cloner.gridCount[2]));
  }
  if (cloner.mode === "radial") {
    const rings = Math.max(1, cloner.radialRings);
    return rings * Math.max(1, cloner.count) + (Math.max(0, cloner.radialCountStep) * rings * (rings - 1)) / 2;
  }
  return cloner.count;
}
