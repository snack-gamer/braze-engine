import type { AnimatorGraphEdge, AnimatorGraphNode } from "../../application/animator-graph-model";
import type { AnimatorParameter } from "../../domain/animator-parameters";
import type { AnimatorGraphConnectionPreview } from "./animator-graph-connection";
import {
  animatorGraphConnectionLaneOffsets,
  animatorGraphEdgeGeometry,
  animatorGraphPreviewGeometry,
} from "./animator-graph-edge-geometry";

type AnimatorGraphConnectionsProps = Readonly<{
  nodes: readonly AnimatorGraphNode[];
  edges: readonly AnimatorGraphEdge[];
  parameters: readonly AnimatorParameter[];
  width: number;
  height: number;
  preview?: AnimatorGraphConnectionPreview;
  selectedTransitionId?: string;
  activeTransitionIds: ReadonlySet<string>;
  transitionProgressById: ReadonlyMap<string, number>;
  onSelect: (edge: AnimatorGraphEdge) => void;
}>;

export function AnimatorGraphConnections({
  nodes,
  edges,
  parameters,
  width,
  height,
  preview,
  selectedTransitionId,
  activeTransitionIds,
  transitionProgressById,
  onSelect,
}: AnimatorGraphConnectionsProps) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const parameterKinds = new Map(parameters.map((parameter) => [parameter.id, parameter.kind]));
  const laneOffsets = animatorGraphConnectionLaneOffsets(edges);
  return (
    <svg className="animator-graph-connections" width={width} height={height} aria-label="Animator graph connections">
      {edges.map((edge) => {
        const source = byId.get(edge.sourceNodeId);
        const destination = byId.get(edge.destinationNodeId);
        if (!source || !destination) return null;
        const geometry = animatorGraphEdgeGeometry(source, destination, laneOffsets.get(edge) ?? 0);
        const selected = edge.kind === "transition" && selectedTransitionId === edge.id;
        const active = edge.kind === "transition" && activeTransitionIds.has(edge.id);
        const progress = transitionProgressById.get(edge.id);
        const blendWeight = edge.kind === "entry" ? destination.previewWeight : undefined;
        return (
          <g
            key={`${edge.kind}:${edge.id}:${edge.sourceNodeId}`}
            className="animator-graph-edge"
            data-selected={selected || undefined}
            data-active={active || undefined}
            data-playback-progress={edge.kind === "transition" ? progress?.toFixed(4) : undefined}
            data-kind={edge.kind}
            data-source-node-id={edge.sourceNodeId}
            data-destination-node-id={edge.destinationNodeId}
            role={edge.kind === "transition" ? "button" : undefined}
            tabIndex={edge.kind === "transition" ? 0 : undefined}
            aria-label={edge.kind === "transition"
              ? `Edit transition from ${source.label} to ${destination.label}: ${edgeSummary(edge)}`
              : undefined}
            style={blendWeight === undefined ? undefined : { opacity: 0.18 + blendWeight * 0.82 }}
            onClick={(event) => {
              if (edge.kind !== "transition") return;
              event.stopPropagation();
              onSelect(edge);
            }}
            onKeyDown={(event) => {
              if (edge.kind !== "transition" || (event.key !== "Enter" && event.key !== " ")) return;
              event.preventDefault();
              onSelect(edge);
            }}
          >
            {edge.kind === "transition" && <path className="animator-graph-edge__hit" d={geometry.path} />}
            <path className="animator-graph-edge__line" d={geometry.path} />
            {edge.kind === "transition" && progress !== undefined && <path
              className="animator-graph-edge__progress"
              d={geometry.path}
              pathLength={1}
              strokeDasharray={`${progress} 1`}
            />}
            <path
              className="animator-edge-arrow"
              d="M -5 -4 L 5 0 L -5 4 Z"
              transform={`translate(${geometry.midpoint.x} ${geometry.midpoint.y}) rotate(${geometry.arrowAngleDegrees})`}
            />
            {edge.kind === "transition" && edge.transition!.conditions.length > 0 && (
              <ConditionBadge
                typeCodes={edge.transition!.conditions.map((condition) => (
                  parameterTypeCode(parameterKinds.get(condition.parameterId))
                ))}
                x={geometry.midpoint.x}
                y={geometry.midpoint.y}
                angleDegrees={geometry.arrowAngleDegrees}
              />
            )}
          </g>
        );
      })}
      {preview && previewConnection(byId, preview)}
    </svg>
  );
}

function ConditionBadge({ typeCodes, x, y, angleDegrees }: Readonly<{
  typeCodes: readonly string[];
  x: number;
  y: number;
  angleDegrees: number;
}>) {
  const count = typeCodes.length;
  const uniqueTypes = [...new Set(typeCodes)];
  const label = count === 1
    ? uniqueTypes[0]!
    : uniqueTypes.length === 1
      ? `${uniqueTypes[0]} ×${count}`
      : `${uniqueTypes.join(" ")} · ${count}`;
  const width = 12 + label.length * 5.2;
  const angle = readableLineAngle(angleDegrees);
  const radians = angle * Math.PI / 180;
  const offset = 15;
  const badgeX = x + Math.sin(radians) * offset;
  const badgeY = y - Math.cos(radians) * offset;
  return <g
    className="animator-graph-edge__condition-badge"
    data-condition-count={count}
    data-parameter-types={uniqueTypes.join(" ")}
    transform={`translate(${badgeX} ${badgeY}) rotate(${angle})`}
    aria-hidden="true"
  >
    <rect x={-width / 2} y={-7} width={width} height={14} rx={2} />
    {/* Uppercase glyph ink sits high-left inside its nominal font box. This
        small local-space correction remains stable as the chip rotates. */}
    <text x={0.75} y={0.5} textAnchor="middle" dominantBaseline="central">{label}</text>
  </g>;
}

function parameterTypeCode(kind: AnimatorParameter["kind"] | undefined): string {
  if (!kind) return "?";
  return ({ float: "F", integer: "I", boolean: "B", trigger: "T" })[kind];
}

function readableLineAngle(angleDegrees: number): number {
  if (angleDegrees > 90) return angleDegrees - 180;
  if (angleDegrees < -90) return angleDegrees + 180;
  return angleDegrees;
}

function previewConnection(
  nodes: ReadonlyMap<string, AnimatorGraphNode>,
  preview: AnimatorGraphConnectionPreview,
) {
  const source = nodes.get(preview.sourceNodeId);
  if (!source) return null;
  const destination = preview.status === "valid" && preview.destinationNodeId
    ? nodes.get(preview.destinationNodeId)
    : undefined;
  const geometry = animatorGraphPreviewGeometry(source, preview.pointer, destination);
  return (
    <g
      className="animator-graph-connection-preview"
      data-status={preview.status}
      aria-hidden="true"
    >
      <path
        className="animator-graph-connection-preview__line"
        d={geometry.path}
      />
      <circle
        className="animator-graph-connection-preview__end"
        cx={geometry.end.x}
        cy={geometry.end.y}
        r="4"
      />
    </g>
  );
}

function edgeSummary(edge: AnimatorGraphEdge): string {
  const transition = edge.transition!;
  const time = transition.durationMode === "seconds"
    ? `${transition.duration.toFixed(2)}s`
    : `${Math.round(transition.duration * 100)}%`;
  const conditions = transition.conditions.length === 0 ? "no conditions" : `${transition.conditions.length} condition${transition.conditions.length === 1 ? "" : "s"}`;
  return `${conditions} · ${time}`;
}
