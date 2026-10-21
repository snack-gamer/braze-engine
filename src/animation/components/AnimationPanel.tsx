import { useEffect, useRef, useState } from "react";
import { EditorIcon } from "../../ui/EditorIcon";
import { BottomPanelWindow } from "../../components/BottomPanelWindow";
import type { LibraryAsset } from "../../lib/asset-api";
import {
  closeAnimationClipEditor,
  currentAnimationClipEditorRequest,
  subscribeAnimationClipEditor,
} from "../application/animation-clip-editor-channel";
import type { SceneAnimationController } from "../hooks/useSceneAnimation";
import { AnimationClipEventsEditor } from "./AnimationClipEventsEditor";
import { AnimationPlaybackButton, AnimationPlaybackTimecode } from "./AnimationPlaybackStatus";
import { MotionClipsTab } from "./MotionClipsTab";
import { NormalAnimationTab } from "./NormalAnimationTab";
import type { AnimationClipEventInspectorPort } from "../application/animation-clip-event-inspector";
import type { ImportedClipPreviewChannel } from "../application/imported-clip-preview-channel";

type AnimationPanelProps = {
  controller: SceneAnimationController;
  active: boolean;
  assets: readonly LibraryAsset[];
  refreshAssets: () => void;
  eventInspector: AnimationClipEventInspectorPort;
  importedClipPreview: ImportedClipPreviewChannel;
};

type AnimationTab = "normal" | "motion";

export function AnimationPanel({
  controller,
  active,
  assets,
  refreshAssets,
  eventInspector,
  importedClipPreview,
}: AnimationPanelProps) {
  const motionInputRef = useRef<HTMLInputElement | null>(null);
  const [activeTab, setActiveTab] = useState<AnimationTab>("normal");
  const [clipRequest, setClipRequest] = useState(currentAnimationClipEditorRequest);
  const { activeObject, document } = controller;
  useEffect(() => subscribeAnimationClipEditor(setClipRequest), []);
  useEffect(() => {
    if (clipRequest) controller.pausePlayback();
  }, [clipRequest, controller.pausePlayback]);
  const clipAsset = clipRequest
    ? assets.find((asset) => asset.filename === clipRequest.filename)
    : undefined;
  const clipSubAsset = clipAsset?.subAssets?.find((subAsset) => (
    subAsset.localId === clipRequest?.localId && subAsset.kind === "clip"
  ));

  if (clipRequest) return <BottomPanelWindow
    label="Imported animation clip"
    className="animation-panel--clip-events"
  >
    {clipAsset && clipSubAsset ? <AnimationClipEventsEditor
      key={`${clipRequest.filename}:${clipRequest.localId}`}
      asset={clipAsset}
      subAsset={clipSubAsset}
      requestedEventId={clipRequest.eventId}
      onClose={closeAnimationClipEditor}
      onSaved={refreshAssets}
      eventInspector={eventInspector}
      active={active}
      importedClipPreview={importedClipPreview}
    /> : <div className="animation-clip-events-message" role="status">
      The selected animation clip is no longer available.
      <button type="button" className="ghost-button compact" onClick={closeAnimationClipEditor}>Back</button>
    </div>}
  </BottomPanelWindow>;

  return (
    <BottomPanelWindow
      label="Animation timeline"
      className={controller.recording ? "recording" : ""}
    >
      <>
          <div className="animation-panel__toolbar">
            <AnimationPlaybackButton controller={controller} active={active} />
            <button
              type="button"
              className={document.loop ? "icon-button animation-icon-button active" : "icon-button animation-icon-button"}
              onClick={controller.toggleLoop}
              title="Loop"
              aria-label="Toggle loop"
            >
              <EditorIcon name="loop" size="control" />
            </button>
            <button
              type="button"
              className={controller.recording ? "icon-button animation-icon-button record active" : "icon-button animation-icon-button record"}
              onClick={controller.toggleRecording}
              disabled={!controller.animationPlayerRoot}
              title="Record transform edits"
              aria-label="Record transform edits"
            >
              <EditorIcon name="record" size="compact" filled={controller.recording} />
            </button>
            <AnimationPlaybackTimecode controller={controller} active={active} />

            <div className="editor-segmented animation-tabs" role="tablist" aria-label="Animation workflow">
              <button
                type="button"
                className={activeTab === "normal" ? "active" : ""}
                onClick={() => setActiveTab("normal")}
                role="tab"
                aria-selected={activeTab === "normal"}
              >
                Normal
              </button>
              <button
                type="button"
                className={activeTab === "motion" ? "active" : ""}
                onClick={() => setActiveTab("motion")}
                role="tab"
                aria-selected={activeTab === "motion"}
              >
                Motion Clips
              </button>
            </div>

            <label className="animation-duration">
              <span>Duration</span>
              <input
                className="editor-input"
                type="number"
                min="0.25"
                max="300"
                step="0.25"
                value={Number(document.duration.toFixed(2))}
                onChange={(event) => controller.setDuration(Number(event.currentTarget.value))}
              />
            </label>

            {activeTab === "normal" ? (
              <button
                type="button"
                className="ghost-button collapse-to-icon animation-key-button"
                onClick={controller.addActiveTransformKeyframe}
                disabled={!activeObject || !controller.animationPlayerRoot}
                title="Add transform keyframe for every axis"
              >
                <EditorIcon name="addKeyframe" size="control" />
                <span>Key All</span>
              </button>
            ) : (
              <button
                type="button"
                className="ghost-button collapse-to-icon animation-key-button"
                onClick={() => motionInputRef.current?.click()}
                disabled={!activeObject || controller.motionImporting}
                title="Import motion clip"
              >
                <EditorIcon name="upload" size="control" />
                <span>{controller.motionImporting ? "Importing" : "Import"}</span>
              </button>
            )}

            <input
              ref={motionInputRef}
              className="hidden-input"
              type="file"
              accept=".fbx,.glb,.gltf"
              multiple
              onChange={(event) => {
                void controller.importMotionFiles(event.currentTarget.files);
                event.currentTarget.value = "";
              }}
            />
          </div>

          {activeTab === "normal" ? (
            <NormalAnimationTab controller={controller} active={active} />
          ) : (
            <MotionClipsTab controller={controller} active={active} />
          )}
      </>
    </BottomPanelWindow>
  );
}
