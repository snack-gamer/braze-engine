import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildAnimatorGraphModel,
  type AnimatorGraphEdge,
} from "../../application/animator-graph-model";
import { setAnimatorGraphNodePosition } from "../../application/animator-behavior-map-authoring";
import { autoArrangeAnimatorGraph } from "../../application/animator-graph-layout";
import type { AnimatorController, AnimatorLayer, AnimatorState } from "../../domain/animator-controller";
import {
  animatorStateMachineScope,
  findAnimatorStateMachine,
} from "../../domain/animator-state-machine";
import type { CharacterVector2 } from "../../domain/character-values";
import type { AnimatorPreview } from "./useAnimatorPreview";
import type { AnimatorWorkspaceSelection } from "./animator-workspace-selection";
import {
  animatorSelectionForGraphNode,
  animatorSelectionForStateIds,
  selectedAnimatorStateIds,
} from "./animator-workspace-selection";
import { animatorClipIdsInMarquee } from "./animator-graph-marquee";
import { AnimatorGraphConnections } from "./AnimatorGraphConnections";
import { AnimatorGraphGrid } from "./AnimatorGraphGrid";
import { AnimatorGraphNodeView } from "./AnimatorGraphNode";
import { AnimatorGraphViewportControls } from "./AnimatorGraphViewportControls";
import {
  animatorGraphClientPointToWorld,
  animatorGraphWorldTransform,
} from "./animator-graph-viewport";
import { useAnimatorGraphViewport } from "./useAnimatorGraphViewport";
import { useAnimatorGraphMarquee } from "./useAnimatorGraphMarquee";
import { useAnimatorClipDrop } from "./useAnimatorClipDrop";
import {
  animatorGraphConnectionSource,
  canBeginAnimatorGraphConnection,
  canCompleteAnimatorGraphConnection,
  sameAnimatorGraphConnectionSource,
} from "./animator-graph-connection";
import { useAnimatorGraphConnections } from "./useAnimatorGraphConnections";
import {
  characterAssetOptionKey,
  type ImportedCharacterAssetOption,
} from "../../application/imported-character-assets";
import { requestAnimationClipEditor } from "../../../animation/application/animation-clip-editor-channel";
import { AnimatorGraphCreateMenu } from "./AnimatorGraphCreateMenu";
import { useAnimatorGraphContextMenu } from "./useAnimatorGraphContextMenu";
import { animatorPreviewLayerFeedback } from "./animator-preview-playback";
import { useAnimatorBlendTreeGraph } from "./useAnimatorBlendTreeGraph";
type AnimatorGraphCanvasProps = Readonly<{
  controller: AnimatorController;
  layer: AnimatorLayer;
  stateMachineId?: string;
  clips: readonly ImportedCharacterAssetOption[];
  selection: AnimatorWorkspaceSelection;
  preview: AnimatorPreview;
  onSelect: (selection: AnimatorWorkspaceSelection) => void;
  onChange: (controller: AnimatorController) => void;
  onOpenStateMachine: (stateMachineId?: string) => void;
  onOpenBlendTree: (stateId: string) => void;
  blendTreeState?: AnimatorState;
}>;
export function AnimatorGraphCanvas({
  controller,
  layer,
  stateMachineId,
  clips,
  selection,
  preview,
  onSelect,
  onChange,
  onOpenStateMachine,
  onOpenBlendTree,
  blendTreeState,
}: AnimatorGraphCanvasProps) {
  const authoredGraph = useMemo(
    () => buildAnimatorGraphModel(controller, layer, stateMachineId),
    [controller, layer, stateMachineId],
  );
  const blendTree = useAnimatorBlendTreeGraph({ controller, layer, state: blendTreeState, preview, onChange });
  const graph = blendTree.graph ?? authoredGraph;
  const isolated = Boolean(blendTree.graph);
  const scope = animatorStateMachineScope(layer, stateMachineId);
  const currentMachine = stateMachineId
    ? findAnimatorStateMachine(layer, stateMachineId)?.machine
    : undefined;
  const [dragPositions, setDragPositions] = useState<ReadonlyMap<string, CharacterVector2>>(() => new Map());
  const viewport = useAnimatorGraphViewport();
  const contextMenu = useAnimatorGraphContextMenu();
  const connections = useAnimatorGraphConnections({
    controller,
    layer,
    stateMachineId,
    nodes: graph.nodes,
    view: viewport.view,
    viewportRef: viewport.viewportRef,
    onChange,
    onSelect,
  });
  useEffect(() => {
    setDragPositions(new Map());
    viewport.reset();
    connections.cancel();
  }, [blendTreeState?.id, connections.cancel, layer.id, stateMachineId, viewport.reset]);
  const connectionNodes = useMemo(() => graph.nodes.map((node) => {
    const position = dragPositions.get(node.id);
    return position ? { ...node, x: position[0], y: position[1] } : node;
  }), [dragPositions, graph.nodes]);
  const playbackFeedback = animatorPreviewLayerFeedback(
    preview.playback,
    preview.transitions,
    layer,
  );
  const blendProgress = blendTreeState ? playbackFeedback.stateProgressById.get(blendTreeState.id) : undefined;
  const selectedTransitionId = selection.kind === "transition" && selection.layerId === layer.id
    ? selection.transitionId
    : undefined;
  const completeMarquee = useCallback((box: Parameters<typeof animatorClipIdsInMarquee>[1]) => {
    const hits = animatorClipIdsInMarquee(graph.nodes, box, viewport.view);
    const stateIds = box.additive
      ? [...new Set([...selectedAnimatorStateIds(selection), ...hits])]
      : hits;
    onSelect(animatorSelectionForStateIds(layer.id, stateIds, stateMachineId));
  }, [graph.nodes, layer.id, onSelect, selection, stateMachineId, viewport.view]);
  const marquee = useAnimatorGraphMarquee(completeMarquee);
  const clipDrop = useAnimatorClipDrop({
    controller,
    layer,
    stateMachineId,
    view: viewport.view,
    onChange,
    onSelect,
  });
  const selectedStateIds = useMemo(() => {
    const current = selectedAnimatorStateIds(selection);
    if (!marquee.box) return new Set(current);
    const hits = animatorClipIdsInMarquee(graph.nodes, marquee.box, viewport.view);
    return new Set(marquee.box.additive ? [...current, ...hits] : hits);
  }, [graph.nodes, marquee.box, selection, viewport.view]);

  const selectEdge = (edge: AnimatorGraphEdge) => {
    if (edge.kind !== "transition" || !edge.source) return;
    onSelect({ kind: "transition", layerId: layer.id, source: edge.source, transitionId: edge.id });
  };

  return (
    <section
      className="animator-graph-panel"
      aria-label={isolated ? "Blend Tree canvas" : `${currentMachine?.name ?? layer.name} state machine graph`}
    >
      <div
        ref={viewport.viewportRef}
        className="animator-graph-viewport"
        tabIndex={0}
        aria-label="Animator graph canvas"
        data-panning={viewport.panning || undefined}
        data-selecting={Boolean(marquee.box) || undefined}
        data-connecting={Boolean(connections.pendingSource) || undefined}
        data-clip-drop-active={!isolated && clipDrop.active || undefined}
        data-state-machine-id={stateMachineId}
        onDragOver={isolated ? blendTree.onDragOver : clipDrop.onDragOver}
        onDragLeave={isolated ? undefined : clipDrop.onDragLeave}
        onDrop={isolated ? blendTree.onDrop : clipDrop.onDrop}
        onPointerDown={(event) => {
          viewport.onPointerDown(event);
          if (!isolated) marquee.onPointerDown(event);
        }}
        onPointerMove={(event) => {
          viewport.onPointerMove(event);
          if (!isolated) marquee.onPointerMove(event);
        }}
        onPointerUp={(event) => {
          viewport.onPointerUp(event);
          if (!isolated) marquee.onPointerUp(event);
        }}
        onPointerCancel={(event) => {
          viewport.onPointerCancel(event);
          if (!isolated) marquee.onPointerCancel(event);
        }}
        onWheel={viewport.onWheel}
        onAuxClick={(event) => event.preventDefault()}
        onContextMenu={(event) => {
          event.preventDefault();
          if (isolated) return;
          const target = event.target;
          if (target instanceof Element
            && target.closest(
              ".animator-graph-node, .animator-graph-edge, .animator-graph-viewport-controls, .animator-connection-mode",
            )) return;
          connections.cancel();
          const bounds = event.currentTarget.getBoundingClientRect();
          contextMenu.openAt(
            { x: event.clientX, y: event.clientY },
            animatorGraphClientPointToWorld(
              viewport.view,
              { x: event.clientX, y: event.clientY },
              { x: bounds.left, y: bounds.top },
            ),
            event.currentTarget,
          );
        }}
        onKeyDown={(event) => {
          if (isolated) return;
          if (event.target !== event.currentTarget
            || (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10"))) return;
          event.preventDefault();
          connections.cancel();
          const bounds = event.currentTarget.getBoundingClientRect();
          const screen = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
          contextMenu.openAt(
            screen,
            animatorGraphClientPointToWorld(
              viewport.view,
              screen,
              { x: bounds.left, y: bounds.top },
            ),
            event.currentTarget,
          );
        }}
        onClick={() => {
          if (viewport.consumePanClick() || marquee.consumeClick()) return;
          if (isolated) return;
          if (connections.pendingSource) {
            connections.cancel();
            return;
          }
          onSelect(stateMachineId
            ? { kind: "scope", layerId: layer.id, stateMachineId }
            : { kind: "layer", layerId: layer.id });
        }}
      >
        {!isolated && connections.pendingSource && (
          <button
            type="button"
            className="animator-connection-mode"
            aria-live="polite"
            onClick={connections.cancel}
          >
            Choose a destination · Esc to cancel
          </button>
        )}
        <AnimatorGraphGrid view={viewport.view} />
        {isolated && graph.nodes.length === 1 && <p className="animator-blend-tree-empty">Empty Blend Tree — drag Animation Clips here.</p>}
        {!isolated && marquee.box && <div className="animator-graph-marquee" style={{
          left: marquee.box.left,
          top: marquee.box.top,
          width: marquee.box.width,
          height: marquee.box.height,
        }} aria-hidden="true" />}
        <div
          className="animator-graph-world"
          style={{
            width: graph.extent.width,
            height: graph.extent.height,
            transform: animatorGraphWorldTransform(viewport.view),
          }}
        >
          <AnimatorGraphConnections
            nodes={connectionNodes}
            edges={graph.edges}
            parameters={controller.parameters}
            width={graph.extent.width}
            height={graph.extent.height}
            preview={connections.preview ?? undefined}
            selectedTransitionId={selectedTransitionId}
            activeTransitionIds={playbackFeedback.activeTransitionIds}
            transitionProgressById={playbackFeedback.transitionProgressById}
            onSelect={selectEdge}
          />
          {graph.nodes.map((node) => {
            const candidateSource = isolated ? null : animatorGraphConnectionSource(node, stateMachineId);
            const source = candidateSource
              && canBeginAnimatorGraphConnection(layer, candidateSource, stateMachineId)
              ? candidateSource
              : null;
            const selected = Boolean(
              (node.stateId && selectedStateIds.has(node.stateId))
              || (isolated && selection.kind === "state" && node.id === selection.blendChildId)
              || (node.stateMachineId
                && selection.kind === "stateMachine"
                && selection.stateMachineId === node.stateMachineId),
            );
            const canReceive = Boolean(connections.pendingSource
              && canCompleteAnimatorGraphConnection(
                controller, layer, connections.pendingSource, node, stateMachineId,
              ));
            const state = node.stateId
              ? scope?.states.find((candidate) => candidate.id === node.stateId)
              : undefined;
            const clipRef = state?.motion?.kind === "clip" ? state.motion.clipRef : undefined;
            const clip = clipRef
              ? clips.find((candidate) => (
                characterAssetOptionKey(candidate.ref) === characterAssetOptionKey(clipRef)
              ))
              : undefined;
            const motionProgress = blendProgress !== undefined && (node.id === "root" || (node.previewWeight ?? 0) > 0)
              ? blendProgress : undefined;
            return (
              <AnimatorGraphNodeView
                key={node.id}
                node={node}
                selected={selected}
                active={isolated ? motionProgress !== undefined : node.stateId
                  ? playbackFeedback.stateProgressById.has(node.stateId)
                  : Boolean(node.stateMachineId
                    && playbackFeedback.activeStateMachineIds.has(node.stateMachineId))}
                playbackProgress={isolated ? motionProgress : node.stateId && node.subtitle === "Clip"
                  ? playbackFeedback.stateProgressById.get(node.stateId) : undefined}
                connecting={Boolean(source
                  && connections.pendingSource
                  && sameAnimatorGraphConnectionSource(source, connections.pendingSource))}
                canBeginConnection={Boolean(source)}
                canReceiveConnection={canReceive}
                scale={viewport.view.scale}
                onSelect={() => {
                  if (isolated) {
                    if (blendTreeState && node.id !== "root") onSelect({
                      kind: "state",
                      layerId: layer.id,
                      stateId: blendTreeState.id, isolated: true,
                      blendChildId: node.id,
                    });
                  } else onSelect(animatorSelectionForGraphNode(layer.id, node, stateMachineId));
                }}
                onOpen={node.stateMachineId
                  ? () => onOpenStateMachine(node.stateMachineId)
                  : node.stateId && state?.motion?.kind === "blendTree"
                    ? () => onOpenBlendTree(node.stateId!)
                  : clip?.ref.localId ? () => requestAnimationClipEditor({
                      filename: clip.sourceFilename,
                      localId: clip.ref.localId!,
                    }) : undefined}
                onBeginConnection={() => source && connections.begin(source)}
                onCompleteConnection={() => connections.pendingSource
                  && connections.complete(connections.pendingSource, node)}
                onPreviewConnection={(clientX, clientY, destinationNodeId) => {
                  if (source) connections.updatePreview(
                    source,
                    node.id,
                    clientX,
                    clientY,
                    destinationNodeId,
                  );
                }}
                onDropConnection={(destinationNodeId) => source
                  ? connections.drop(source, destinationNodeId)
                  : connections.cancel()}
                onCancelConnection={connections.cancel}
                onPositionPreview={(position) => setDragPositions((current) => {
                  const next = new Map(current);
                  next.set(node.id, position);
                  return next;
                })}
                onPositionCancel={() => setDragPositions((current) => {
                  const next = new Map(current);
                  next.delete(node.id);
                  return next;
                })}
                onMove={(position) => {
                  if (isolated) return;
                  onChange(setAnimatorGraphNodePosition(
                    controller,
                    layer.id,
                    node.id,
                    position,
                    stateMachineId,
                  ));
                  setDragPositions((current) => {
                    const next = new Map(current);
                    next.delete(node.id);
                    return next;
                  });
                }}
              />
            );
          })}
        </div>
        <AnimatorGraphViewportControls
          scale={viewport.view.scale}
          onZoomOut={viewport.zoomOut}
          onReset={viewport.reset}
          onZoomIn={viewport.zoomIn}
          onFrame={() => viewport.frame(graph.bounds)}
          onAutoArrange={() => isolated
            ? setDragPositions(new Map())
            : onChange(autoArrangeAnimatorGraph(controller, layer, stateMachineId))}
        />
      </div>
      {!isolated && contextMenu.location && <AnimatorGraphCreateMenu
        controller={controller}
        layer={layer}
        stateMachineId={stateMachineId}
        location={contextMenu.location}
        menuRef={contextMenu.menuRef}
        onClose={contextMenu.close}
        onChange={onChange}
        onSelect={onSelect}
      />}
    </section>
  );
}
