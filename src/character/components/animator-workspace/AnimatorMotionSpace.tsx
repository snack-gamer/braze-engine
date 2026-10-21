import type { PointerEvent as ReactPointerEvent } from "react";
import {
  characterAssetOptionKey,
  type ImportedCharacterAssetOption,
} from "../../application/imported-character-assets";
import type { AnimatorParameter } from "../../domain/animator-parameters";
import type { AnimatorMotion, BlendTree1D, BlendTree2D } from "../../domain/blend-tree";
import type { RuntimeAnimatorParameterValue } from "../../runtime/animator-runtime";
import { evaluateBlendTree1d } from "../../runtime/blend-tree-1d";
import { inspectorSectionClass } from "./animator-inspector-classes";

type AnimatorMotionSpaceProps = Readonly<{
  motion: AnimatorMotion | null;
  clips: readonly ImportedCharacterAssetOption[];
  parameters: readonly AnimatorParameter[];
  values: Readonly<Record<string, RuntimeAnimatorParameterValue>>;
  onSetParameter: (parameterId: string, value: number) => void;
}>;

const WIDTH = 274;
const HEIGHT = 190;
const PADDING = 22;
const ONE_D_HEIGHT = 122;
const ONE_D_LEFT = 42;
const ONE_D_RIGHT = WIDTH - 12;
const ONE_D_TOP = 16;
const ONE_D_BOTTOM = 84;

export function AnimatorMotionSpace({
  motion,
  clips,
  parameters,
  values,
  onSetParameter,
}: AnimatorMotionSpaceProps) {
  if (motion?.kind !== "blendTree" || motion.tree.kind === "direct") return null;
  if (motion.tree.kind === "1d") {
    const tree = motion.tree;
    const parameterName = parameters.find((parameter) => parameter.id === tree.parameterId)?.name
      ?? "Missing parameter";
    return <MotionSpace1D
      tree={tree}
      clips={clips}
      parameterName={parameterName}
      value={numberValue(values[tree.parameterId])}
      onChange={(value) => onSetParameter(tree.parameterId, value)}
    />;
  }
  const tree = motion.tree;
  const bounds = motionBounds2D(tree);
  const value: readonly [number, number] = [
    numberValue(values[tree.parameterXId]),
    numberValue(values[tree.parameterYId]),
  ];
  const updateFromPointer = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.type === "pointermove" && event.buttons !== 1) return;
    if (event.type === "pointerdown") {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const x = bounds.minX + clamp01((event.clientX - rect.left - PADDING) / (rect.width - PADDING * 2)) * (bounds.maxX - bounds.minX);
    const y = bounds.maxY - clamp01((event.clientY - rect.top - PADDING) / (rect.height - PADDING * 2)) * (bounds.maxY - bounds.minY);
    onSetParameter(tree.parameterXId, x);
    onSetParameter(tree.parameterYId, y);
  };
  return (
    <section className={`animator-motion-space ${inspectorSectionClass}`}>
      <header><strong>2D Motion Space</strong><span>{tree.kind.replace("2d", "")}</span></header>
      <svg
        className="animator-motion-space__plot"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="slider"
        aria-label="2D motion preview input"
        onPointerDown={updateFromPointer}
        onPointerMove={updateFromPointer}
      >
        <rect x={PADDING} y={PADDING} width={WIDTH - PADDING * 2} height={HEIGHT - PADDING * 2} className="animator-motion-space__surface" />
        <line x1={plotX(0, bounds)} x2={plotX(0, bounds)} y1={PADDING} y2={HEIGHT - PADDING} className="animator-motion-space__axis" />
        <line x1={PADDING} x2={WIDTH - PADDING} y1={plotY(0, bounds)} y2={plotY(0, bounds)} className="animator-motion-space__axis" />
        {tree.children.map((child) => <circle
          key={child.id}
          cx={plotX(child.position[0], bounds)}
          cy={plotY(child.position[1], bounds)}
          r="5"
          className="animator-motion-space__sample"
        />)}
        <circle cx={plotX(value[0], bounds)} cy={plotY(value[1], bounds)} r="8" className="animator-motion-space__puck" />
      </svg>
    </section>
  );
}

function MotionSpace1D({ tree, clips, parameterName, value, onChange }: Readonly<{
  tree: BlendTree1D;
  clips: readonly ImportedCharacterAssetOption[];
  parameterName: string;
  value: number;
  onChange: (value: number) => void;
}>) {
  const children = [...tree.children].sort((left, right) => left.threshold - right.threshold || left.id.localeCompare(right.id));
  const evaluated = evaluateBlendTree1d(tree.children.map((child) => ({
    motionId: child.id,
    threshold: child.threshold,
  })), value).value;
  const labels = new Map(tree.children.map((child) => [child.id, motionLabel(child.motion, clips)]));
  const heading = <header><strong>1D Blend Preview</strong><span>{parameterName} = {formatValue(value)}</span></header>;
  const onlyChild = children[0];
  const setup = children.length === 0
    ? ["No motions to blend", "Drag Animation Clips into the Motions area above."]
    : children.length === 1
      ? [`${labels.get(onlyChild!.id)} plays at 100%`, `Threshold ${formatValue(onlyChild!.threshold)} · Add another motion to create a blend.`]
      : !evaluated
        ? ["Weights cannot be previewed", "Give every motion a unique threshold."]
        : undefined;
  const [minimum, maximum] = children.length > 0
    ? blendBounds(children.map((child) => child.threshold))
    : [-1, 1];
  const position = parameterX(value, minimum, maximum);
  const update = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.type === "pointermove" && event.buttons !== 1) return;
    if (event.type === "pointerdown") {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const viewX = (event.clientX - rect.left) / rect.width * WIDTH;
    onChange(minimum + clamp01((viewX - ONE_D_LEFT) / (ONE_D_RIGHT - ONE_D_LEFT)) * (maximum - minimum));
  };
  return (
    <section className={`animator-motion-space ${inspectorSectionClass}`}>
      {heading}
      <svg
        className="animator-motion-space__plot is-1d"
        viewBox={`0 0 ${WIDTH} ${ONE_D_HEIGHT}`}
        role="slider"
        aria-label={`${parameterName} blend preview`}
        aria-orientation="horizontal"
        aria-valuemin={minimum}
        aria-valuemax={maximum}
        aria-valuenow={value}
        aria-valuetext={evaluated
          ? evaluated.map((sample) => `${labels.get(sample.motionId)} ${formatPercent(sample.weight)}`).join(", ")
          : "No active motions"}
        onPointerDown={update}
        onPointerMove={update}
      >
        <rect x={ONE_D_LEFT} y={ONE_D_TOP} width={ONE_D_RIGHT - ONE_D_LEFT} height={ONE_D_BOTTOM - ONE_D_TOP} className="animator-motion-space__surface" />
        <text x={ONE_D_LEFT - 7} y={ONE_D_TOP + 4} textAnchor="end">100%</text>
        <text x={ONE_D_LEFT - 7} y={ONE_D_BOTTOM + 4} textAnchor="end">0%</text>
        {children.map((sample, index) => <path
          key={sample.id}
          d={envelopePath(children, index, minimum, maximum)}
          className="animator-motion-space__envelope animator-motion-space__series"
          data-series={index % 4}
        />)}
        {children.map((sample, index) => {
          const x = parameterX(sample.threshold, minimum, maximum);
          return <g key={sample.id} className="animator-motion-space__series" data-series={index % 4}>
            <line x1={x} x2={x} y1={ONE_D_TOP} y2={ONE_D_BOTTOM} className="animator-motion-space__threshold" />
            <text x={x} y={ONE_D_BOTTOM + 16} textAnchor="middle">{formatValue(sample.threshold)}</text>
          </g>;
        })}
        <line x1={position} x2={position} y1={ONE_D_TOP - 5} y2={ONE_D_BOTTOM + 5} className="animator-motion-space__playhead" />
      </svg>
      {setup && <div className="animator-motion-space__setup">
        <strong>{setup[0]}</strong>
        <span>{setup[1]}</span>
      </div>}
    </section>
  );
}

function motionLabel(
  motion: AnimatorMotion,
  clips: readonly ImportedCharacterAssetOption[],
): string {
  if (motion.kind === "blendTree") return "Nested Blend Tree";
  const key = characterAssetOptionKey(motion.clipRef);
  return clips.find((clip) => characterAssetOptionKey(clip.ref) === key)?.label
    ?? motion.clipRef.localId
    ?? "Missing clip";
}

function parameterX(value: number, minimum: number, maximum: number): number {
  return ONE_D_LEFT + clamp01((value - minimum) / (maximum - minimum)) * (ONE_D_RIGHT - ONE_D_LEFT);
}

function weightY(weight: number): number {
  return ONE_D_BOTTOM - clamp01(weight) * (ONE_D_BOTTOM - ONE_D_TOP);
}

function envelopePath(
  children: BlendTree1D["children"],
  index: number,
  minimum: number,
  maximum: number,
): string {
  const points: Array<readonly [number, number]> = [[minimum, index === 0 ? 1 : 0]];
  if (index > 0) points.push([children[index - 1]!.threshold, 0]);
  points.push([children[index]!.threshold, 1]);
  if (index < children.length - 1) points.push([children[index + 1]!.threshold, 0]);
  points.push([maximum, index === children.length - 1 ? 1 : 0]);
  const profile = points.map(([parameter, weight], pointIndex) => (
    `${pointIndex === 0 ? "M" : "L"} ${parameterX(parameter, minimum, maximum)} ${weightY(weight)}`
  )).join(" ");
  return `${profile} L ${ONE_D_RIGHT} ${ONE_D_BOTTOM} L ${ONE_D_LEFT} ${ONE_D_BOTTOM} Z`;
}

function blendBounds(thresholds: readonly number[]): readonly [number, number] {
  const first = Math.min(...thresholds);
  const last = Math.max(...thresholds);
  const span = last - first;
  if (span > 0) return [first, last];
  const padding = Math.max(Math.abs(first) * 0.1, 1);
  return [first - padding, last + padding];
}

function formatValue(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function formatPercent(weight: number): string {
  return `${Math.round(weight * 100)}%`;
}

function motionBounds2D(tree: BlendTree2D) {
  const xs = tree.children.map((child) => child.position[0]);
  const ys = tree.children.map((child) => child.position[1]);
  const minX = Math.min(-1, ...xs);
  const maxX = Math.max(1, ...xs);
  const minY = Math.min(-1, ...ys);
  const maxY = Math.max(1, ...ys);
  return { minX, maxX, minY, maxY };
}

function plotX(value: number, bounds: ReturnType<typeof motionBounds2D>): number {
  return PADDING + clamp01((value - bounds.minX) / (bounds.maxX - bounds.minX)) * (WIDTH - PADDING * 2);
}

function plotY(value: number, bounds: ReturnType<typeof motionBounds2D>): number {
  return HEIGHT - PADDING - clamp01((value - bounds.minY) / (bounds.maxY - bounds.minY)) * (HEIGHT - PADDING * 2);
}

function numberValue(value: RuntimeAnimatorParameterValue | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
