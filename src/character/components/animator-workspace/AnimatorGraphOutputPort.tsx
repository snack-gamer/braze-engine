import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import type { AnimatorGraphNode } from "../../application/animator-graph-model";

type AnimatorGraphOutputPortProps = Readonly<{
  node: AnimatorGraphNode;
  active: boolean;
  onBegin: () => void;
  onPreview: (clientX: number, clientY: number, destinationNodeId: string | null) => void;
  onDrop: (destinationNodeId: string | null) => void;
  onCancel: () => void;
}>;

type ConnectionDrag = { pointerId: number; clientX: number; clientY: number; moved: boolean };

const CONNECTION_DRAG_THRESHOLD = 3;

/** Owns pointer capture and hit-testing for one graph connection handle. */
export function AnimatorGraphOutputPort({
  node,
  active,
  onBegin,
  onPreview,
  onDrop,
  onCancel,
}: AnimatorGraphOutputPortProps) {
  const dragRef = useRef<ConnectionDrag | null>(null);
  const cancelPointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    onCancel();
  };
  return (
    <button
      type="button"
      className="animator-graph-port animator-graph-port--output"
      title={node.kind === "entry" ? "Connect Entry" : "Create transition"}
      aria-label={node.kind === "entry" ? "Connect Entry" : `Create transition from ${node.label}`}
      aria-pressed={active}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = {
          pointerId: event.pointerId,
          clientX: event.clientX,
          clientY: event.clientY,
          moved: false,
        };
        onBegin();
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        if (!drag.moved) {
          drag.moved = Math.hypot(
            event.clientX - drag.clientX,
            event.clientY - drag.clientY,
          ) >= CONNECTION_DRAG_THRESHOLD;
        }
        if (drag.moved) onPreview(
          event.clientX,
          event.clientY,
          graphNodeIdAtPoint(event.clientX, event.clientY, event.currentTarget),
        );
      }}
      onPointerUp={(event) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        dragRef.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        if (!drag.moved) return;
        event.preventDefault();
        event.stopPropagation();
        onDrop(graphNodeIdAtPoint(event.clientX, event.clientY, event.currentTarget));
      }}
      onPointerCancel={cancelPointer}
      onLostPointerCapture={(event) => {
        if (dragRef.current) cancelPointer(event);
      }}
      onClick={(event) => {
        event.stopPropagation();
        if (event.detail === 0) onBegin();
      }}
    />
  );
}

function graphNodeIdAtPoint(
  clientX: number,
  clientY: number,
  source: HTMLElement,
): string | null {
  const viewport = source.closest(".animator-graph-viewport");
  const node = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>(
    ".animator-graph-node",
  );
  return node?.closest(".animator-graph-viewport") === viewport ? node.dataset.nodeId ?? null : null;
}
