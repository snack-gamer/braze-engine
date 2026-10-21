import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { animatorGraphNodeSize, type AnimatorGraphNode } from "../../application/animator-graph-model";
import type { CharacterVector2 } from "../../domain/character-values";
import { animatorGraphPositionAfterPointerMove } from "./animator-graph-drag";
import { AnimatorGraphOutputPort } from "./AnimatorGraphOutputPort";
import { EditorIcon } from "../../../ui/EditorIcon";

type AnimatorGraphNodeProps = Readonly<{
  node: AnimatorGraphNode;
  selected: boolean;
  active: boolean;
  playbackProgress?: number;
  connecting: boolean;
  canBeginConnection: boolean;
  canReceiveConnection: boolean;
  scale: number;
  onSelect: () => void;
  onOpen?: () => void;
  onBeginConnection: () => void;
  onCompleteConnection: () => void;
  onPreviewConnection: (
    clientX: number,
    clientY: number,
    destinationNodeId: string | null,
  ) => void;
  onDropConnection: (destinationNodeId: string | null) => void;
  onCancelConnection: () => void;
  onPositionPreview: (position: CharacterVector2) => void;
  onPositionCancel: () => void;
  onMove: (position: CharacterVector2) => void;
}>;

type Drag = Readonly<{ pointerId: number; clientX: number; clientY: number; x: number; y: number }>;

export function AnimatorGraphNodeView({
  node,
  selected,
  active,
  playbackProgress,
  connecting,
  canBeginConnection,
  canReceiveConnection,
  scale,
  onSelect,
  onOpen,
  onBeginConnection,
  onCompleteConnection,
  onPreviewConnection,
  onDropConnection,
  onCancelConnection,
  onPositionPreview,
  onPositionCancel,
  onMove,
}: AnimatorGraphNodeProps) {
  const [position, setPosition] = useState<CharacterVector2>([node.x, node.y]);
  const size = animatorGraphNodeSize(node);
  const blendTreeKind = blendTreeKindLabel(node.motionKind);
  const icon = graphNodeIcon(node);
  const dragRef = useRef<Drag | null>(null);
  useEffect(() => setPosition([node.x, node.y]), [node.x, node.y]);

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      x: position[0],
      y: position[1],
    };
  };
  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const next = positionAtPointer(drag, event.clientX, event.clientY, scale);
    setPosition(next);
    onPositionPreview(next);
  };
  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    const finalPosition = positionAtPointer(drag, event.clientX, event.clientY, scale);
    setPosition(finalPosition);
    onPositionPreview(finalPosition);
    onMove(finalPosition);
    onSelect();
  };
  const cancelDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setPosition([node.x, node.y]);
    onPositionCancel();
  };

  return (
    <article
      className="animator-graph-node"
      data-kind={node.kind}
      data-motion-kind={node.motionKind}
      data-node-id={node.id}
      data-selected={selected || undefined}
      data-active={active || undefined}
      data-playback={playbackProgress !== undefined || undefined}
      data-connecting={connecting || undefined}
      data-can-receive={canReceiveConnection || undefined}
      data-default={node.defaultState || undefined}
      style={{
        left: position[0],
        top: position[1],
        width: size.width,
        height: size.height,
      }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      onDoubleClick={onOpen ? (event) => {
        event.stopPropagation();
        onOpen();
      } : undefined}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onSelect();
      }}
    >
      {canReceiveConnection && (
        <button
          type="button"
          className="animator-graph-port animator-graph-port--input"
          title="Connect here"
          aria-label={`Connect to ${node.label}`}
          onClick={(event) => {
            event.stopPropagation();
            onCompleteConnection();
          }}
        />
      )}
      <div
        className="animator-graph-node__drag"
        role="button"
        tabIndex={0}
        aria-label={`Select ${node.label}`}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={finishDrag}
        onPointerCancel={cancelDrag}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          onSelect();
        }}
      >
        <span className="animator-graph-node__title">
          <span className="animator-graph-node__marker" aria-hidden="true">
            <EditorIcon
              name={icon}
              size="compact"
              className={blendTreeKind ? "animator-graph-node__blend-icon" : ""}
            />
          </span>
          <strong>{node.label}</strong>
          {blendTreeKind && <span className="animator-graph-node__motion-kind">{blendTreeKind}</span>}
        </span>
        <small>
          {node.defaultState && <span className="animator-graph-node__default">Entry</span>}
          <span>{node.subtitle}</span>
        </small>
      </div>
      {canBeginConnection && (
        <AnimatorGraphOutputPort
          node={node}
          active={connecting}
          onBegin={onBeginConnection}
          onPreview={onPreviewConnection}
          onDrop={onDropConnection}
          onCancel={onCancelConnection}
        />
      )}
      {node.kind === "state" && playbackProgress !== undefined && (
        <div
          className="animator-graph-node__playback"
          role="progressbar"
          aria-label={`Playback progress for ${node.label}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(playbackProgress * 100)}
        >
          <span className="animator-graph-node__playback-fill" style={{ width: `${playbackProgress * 100}%` }} />
          <span className="animator-graph-node__playback-thumb" style={{ left: `${playbackProgress * 100}%` }} />
        </div>
      )}
    </article>
  );
}

function blendTreeKindLabel(kind: AnimatorGraphNode["motionKind"]): string | undefined {
  if (kind === "blendTree1d") return "1D";
  if (kind === "blendTree2d") return "2D";
  if (kind === "blendTreeDirect") return "Direct";
  return undefined;
}

function graphNodeIcon(node: AnimatorGraphNode) {
  if (node.kind === "entry") return "play" as const;
  if (node.kind === "exit") return "jumpToEnd" as const;
  if (node.kind === "anyState") return "motionPulse" as const;
  if (node.kind === "stateMachine" || node.motionKind?.startsWith("blendTree")) return "animator" as const;
  return "animation" as const;
}

function positionAtPointer(
  drag: Drag,
  clientX: number,
  clientY: number,
  scale: number,
): CharacterVector2 {
  return animatorGraphPositionAfterPointerMove(
    [drag.x, drag.y],
    [clientX - drag.clientX, clientY - drag.clientY],
    scale,
  );
}
