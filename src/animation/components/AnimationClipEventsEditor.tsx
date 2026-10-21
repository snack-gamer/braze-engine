import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AssetSubAsset, LibraryAsset } from "../../lib/asset-api";
import { normalizeModelAnimationEvents } from "../../lib/model-import-settings";
import { useModelImportSettings } from "../../hooks/useModelImportSettings";
import {
  addAnimationClipEvent,
  animationClipEvents,
  patchAnimationClipEvent,
  removeAnimationClipEvent,
  type AnimationClipEventTarget,
} from "../application/animation-clip-event-authoring";
import type {
  AnimationClipEventInspectorBinding,
  AnimationClipEventInspectorPort,
} from "../application/animation-clip-event-inspector";
import type { ImportedClipPreviewChannel } from "../application/imported-clip-preview-channel";
import { EditorIcon } from "../../ui/EditorIcon";
import { useImportedAnimationClipPresentation } from "../hooks/useImportedAnimationClipPresentation";
import {
  ImportedAnimationClipTimeline,
  type ImportedAnimationClipPlayback,
} from "./ImportedAnimationClipTimeline";
import "./AnimationClipEventsEditor.css";

type AnimationClipEventsEditorProps = Readonly<{
  asset: LibraryAsset;
  subAsset: AssetSubAsset;
  requestedEventId?: string;
  onClose: () => void;
  onSaved: () => void;
  eventInspector: AnimationClipEventInspectorPort;
  active: boolean;
  importedClipPreview: ImportedClipPreviewChannel;
}>;

export function AnimationClipEventsEditor({
  asset,
  subAsset,
  requestedEventId,
  onClose,
  onSaved,
  eventInspector,
  active,
  importedClipPreview,
}: AnimationClipEventsEditorProps) {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(requestedEventId ?? null);
  const [authoringError, setAuthoringError] = useState("");
  const focusEventIdRef = useRef<string | null>(requestedEventId ?? null);
  const importer = useModelImportSettings({
    asset,
    enabled: true,
    onSaved,
  });
  const clipPresentation = useImportedAnimationClipPresentation({
    asset,
    subAsset,
    importVersion: importer.document?.importVersion,
    enabled: Boolean(importer.document),
  });
  const durationSeconds = clipPresentation.presentation?.durationSeconds
    ?? clipDurationSeconds(subAsset);
  const target = useMemo((): AnimationClipEventTarget => ({
    localId: subAsset.localId,
    durationSeconds,
    looping: subAsset.looping !== false,
    sourceEvents: normalizeModelAnimationEvents(subAsset.events),
  }), [durationSeconds, subAsset]);
  const events = animationClipEvents(importer.draft, target);
  const selectedEvent = events.find((event) => event.id === selectedEventId) ?? null;
  const inspectorOwner = useMemo(() => ({
    filename: asset.filename,
    localId: subAsset.localId,
  }), [asset.filename, subAsset.localId]);
  useEffect(() => {
    if (selectedEventId && !events.some((event) => event.id === selectedEventId)) {
      setSelectedEventId(null);
    }
  }, [events, selectedEventId]);

  const applySettings = useCallback((next: typeof importer.draft) => {
    importer.patch({ clipSettings: next.clipSettings });
    setAuthoringError("");
  }, [importer.patch]);
  const mutate = useCallback((operation: () => typeof importer.draft) => {
    try {
      applySettings(operation());
    } catch (caught) {
      setAuthoringError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [applySettings]);
  const addEvent = useCallback((timeSeconds: number) => {
    try {
      const next = addAnimationClipEvent(importer.draft, target, timeSeconds);
      applySettings(next.settings);
      focusEventIdRef.current = next.eventId;
      setSelectedEventId(next.eventId);
    } catch (caught) {
      setAuthoringError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [applySettings, importer.draft, target]);
  const removeEvent = useCallback((eventId: string) => {
    mutate(() => removeAnimationClipEvent(importer.draft, target, eventId));
    setSelectedEventId((current) => current === eventId ? null : current);
  }, [importer.draft, mutate, target]);
  const renameSelectedEvent = useCallback((name: string) => {
    if (!selectedEventId) return;
    mutate(() => patchAnimationClipEvent(
      importer.draft, target, selectedEventId, { name },
    ));
  }, [importer.draft, mutate, selectedEventId, target]);
  const deleteSelectedEvent = useCallback(() => {
    if (selectedEventId) removeEvent(selectedEventId);
  }, [removeEvent, selectedEventId]);
  const inspectorBinding = useMemo((): AnimationClipEventInspectorBinding | null => (
    selectedEvent ? {
      owner: inspectorOwner,
      event: selectedEvent,
      onRename: renameSelectedEvent,
      onDelete: deleteSelectedEvent,
    } : null
  ), [deleteSelectedEvent, inspectorOwner, renameSelectedEvent, selectedEvent]);
  const selectEvent = useCallback((eventId: string) => {
    if (inspectorBinding?.event.id === eventId) {
      focusEventIdRef.current = null;
      eventInspector.focus(inspectorBinding);
      return;
    }
    focusEventIdRef.current = eventId;
    setSelectedEventId(eventId);
  }, [eventInspector, inspectorBinding]);
  const clipPreviewRef = useMemo(() => asset.guid ? {
    guid: asset.guid,
    localId: subAsset.localId,
  } : null, [asset.guid, subAsset.localId]);
  const syncPlaybackPreview = useCallback((playback: ImportedAnimationClipPlayback) => {
    if (!active || !clipPreviewRef) {
      importedClipPreview.clear();
      return;
    }
    importedClipPreview.publish({
      clipRef: clipPreviewRef,
      timeSeconds: playback.timeSeconds,
    });
  }, [active, clipPreviewRef, importedClipPreview]);

  useEffect(() => {
    if (!requestedEventId) return;
    focusEventIdRef.current = requestedEventId;
    setSelectedEventId(requestedEventId);
  }, [requestedEventId]);
  useEffect(() => {
    if (!inspectorBinding) {
      eventInspector.clear(inspectorOwner);
      return;
    }
    if (focusEventIdRef.current === inspectorBinding.event.id) {
      focusEventIdRef.current = null;
      eventInspector.focus(inspectorBinding);
    } else {
      eventInspector.sync(inspectorBinding);
    }
  }, [eventInspector, inspectorBinding, inspectorOwner]);
  useEffect(() => () => eventInspector.clear(inspectorOwner), [eventInspector, inspectorOwner]);
  useEffect(() => {
    if (!active || !clipPreviewRef) importedClipPreview.clear();
    return importedClipPreview.clear;
  }, [active, clipPreviewRef, importedClipPreview]);

  return <div className="animation-clip-events-editor">
    <header className="animation-clip-events-toolbar">
      <button type="button" className="icon-button compact" title="Back to scene animation" onClick={onClose}>
        <EditorIcon name="close" size="compact" />
      </button>
      <div className="animation-clip-events-toolbar__identity">
        <strong>{subAsset.name}</strong><span>{asset.name}</span>
      </div>
      <span className="animation-clip-events-toolbar__duration">
        {target.durationSeconds.toFixed(2)} s · {events.length} {events.length === 1 ? "event" : "events"}
      </span>
      {importer.dirty && <span className="animation-clip-events-toolbar__dirty">
        {importer.recoveryConflict
          ? "Recovered · Conflict"
          : importer.recovered ? "Recovered · Unsaved" : "Unsaved"}
      </span>}
      <button
        type="button"
        className="ghost-button compact"
        disabled={(!importer.dirty && !importer.recoveryConflict) || importer.saving}
        onClick={importer.revert}
      ><EditorIcon name="undo" size="row-action" /> Revert</button>
      <button
        type="button"
        className="ghost-button compact accent"
        disabled={!importer.dirty
          || importer.saving
          || importer.loading
          || importer.recoveryConflict}
        onClick={importer.save}
      ><EditorIcon name="save" size="row-action" /> {importer.saving ? "Applying…" : "Apply & Reimport"}</button>
    </header>

    {importer.loading && <div className="animation-clip-events-message" role="status">Loading clip settings…</div>}
    {!importer.loading && <div className="animation-clip-events-workspace">
      <ImportedAnimationClipTimeline
        clipName={subAsset.name}
        durationSeconds={target.durationSeconds}
        frameRate={clipPresentation.presentation?.frameRate ?? clipFrameRate(subAsset)}
        looping={target.looping}
        active={active}
        keyRows={clipPresentation.presentation?.rows ?? []}
        keysLoading={clipPresentation.loading}
        keysError={clipPresentation.error}
        events={events}
        selectedEventId={selectedEventId}
        onSelectEvent={selectEvent}
        onAddEvent={addEvent}
        onMoveEvent={(eventId, timeSeconds) => mutate(() => patchAnimationClipEvent(
          importer.draft, target, eventId, { timeSeconds },
        ))}
        onDeleteEvent={removeEvent}
        onPlaybackChange={syncPlaybackPreview}
      />
      <p className="animation-clip-events-hint">Scrub the ruler or key rows. Right-click the Event line to add a marker; imported motion keys are read-only.</p>
    </div>}
    {(importer.error || authoringError) && <div className="animation-clip-events-error" role="alert">
      {authoringError || importer.error}
    </div>}
  </div>;
}

function clipDurationSeconds(subAsset: AssetSubAsset): number {
  if (typeof subAsset.durationSeconds === "number"
    && Number.isFinite(subAsset.durationSeconds)
    && subAsset.durationSeconds > 0) return subAsset.durationSeconds;
  const firstFrame = typeof subAsset.firstFrame === "number" ? subAsset.firstFrame : 0;
  const lastFrame = typeof subAsset.lastFrame === "number" ? subAsset.lastFrame : 0;
  const frameRate = typeof subAsset.frameRate === "number" ? subAsset.frameRate : 0;
  return lastFrame > firstFrame && frameRate > 0 ? (lastFrame - firstFrame) / frameRate : 1;
}

function clipFrameRate(subAsset: AssetSubAsset): number {
  return typeof subAsset.frameRate === "number"
    && Number.isFinite(subAsset.frameRate)
    && subAsset.frameRate > 0
    ? subAsset.frameRate
    : 30;
}
