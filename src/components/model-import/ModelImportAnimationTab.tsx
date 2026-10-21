import { useEffect, useState } from "react";
import {
  addModelAnimationClipSettings,
  modelAnimationClipSettings,
  modelAnimationClipSources,
  modelAnimationTakeSources,
  removeModelAnimationClipSettings,
  setModelAnimationClipSettings,
} from "../../character/application/model-animation-clip-settings";
import { createAuthoredId } from "../../identity/authored-id";
import type { LibraryAsset } from "../../lib/asset-api";
import type {
  AnimationCompressionMode,
  ModelImportSettings,
} from "../../lib/model-import-settings";
import { EditorControlGroup } from "../../ui";
import {
  ModelImportSelectRow,
  ModelImportToggleRow,
} from "./ModelImportControlRows";
import { ModelImportAnimationClips } from "./ModelImportAnimationClips";
import type { ModelImportAnimationPreviewSelection } from "./ModelImportAnimationPreview";
import "./ModelImportAnimationTab.css";

type Props = {
  asset: LibraryAsset;
  settings: ModelImportSettings;
  patch: (patch: Partial<ModelImportSettings>) => void;
  /** undefined leaves the Animation tab; null means it is active without a playable draft. */
  onPreviewChange?: (preview: ModelImportAnimationPreviewSelection | null | undefined) => void;
};

export function ModelImportAnimationTab({ asset, settings, patch, onPreviewChange }: Props) {
  const takes = modelAnimationTakeSources(asset.subAssets ?? []);
  const clips = modelAnimationClipSources(asset.subAssets ?? [], settings);
  const rows = clips.map((source) => ({ source, settings: modelAnimationClipSettings(settings, source) }));
  const [selectedLocalId, setSelectedLocalId] = useState(clips[0]?.localId ?? "");
  const selected = clips.find((clip) => clip.localId === selectedLocalId) ?? clips[0];
  const selectedSettings = selected ? modelAnimationClipSettings(settings, selected) : null;
  useEffect(() => {
    if (!settings.importAnimations || !selected || !selectedSettings) {
      onPreviewChange?.(null);
      return;
    }
    onPreviewChange?.({ clip: selected, settings: selectedSettings });
    return () => onPreviewChange?.(undefined);
  }, [
    onPreviewChange,
    selected?.localId,
    selected?.sourceIndex,
    selectedSettings?.name,
    selectedSettings?.firstFrame,
    selectedSettings?.lastFrame,
    selectedSettings?.looping,
    selectedSettings?.loopPose,
    settings.importAnimations,
  ]);
  const addClip = () => {
    const take = takes.find((candidate) => candidate.localId === selected?.sourceTakeLocalId)
      ?? takes[0];
    if (!take) return;
    const localId = `clip:${createAuthoredId("segment")}`;
    const takeClipCount = clips.filter((clip) => clip.sourceTakeLocalId === take.localId).length;
    const name = `${take.sourceName} ${takeClipCount + 1}`;
    patch(addModelAnimationClipSettings(settings, take, localId, name));
    setSelectedLocalId(localId);
  };
  const removeClip = () => {
    if (!selected) return;
    const remaining = clips.filter((clip) => clip.localId !== selected.localId);
    patch(removeModelAnimationClipSettings(settings, selected));
    setSelectedLocalId(remaining[0]?.localId ?? "");
  };
  return (
    <div className="model-import-animation-tab">
      <EditorControlGroup
        id="asset.importSettings.animation.clips"
        title="Animation Clips"
        meta={settings.importAnimations ? "Imported" : "Skipped"}
        note="Braze preserves source interpolation. Keyframe Reduction removes redundant keys before clips enter the shared asset cache."
      >
        <ModelImportToggleRow
          label="Import Animation"
          checked={settings.importAnimations}
          onChange={(importAnimations) => patch({ importAnimations })}
        />
        <ModelImportSelectRow<AnimationCompressionMode>
          label="Compression"
          value={settings.animationCompression}
          options={[
            { value: "off", label: "Off" },
            { value: "keyframeReduction", label: "Keyframe Reduction" },
          ]}
          onChange={(animationCompression) => patch({ animationCompression })}
        />
      </EditorControlGroup>

      {settings.importAnimations && takes.length > 0 && (
        <ModelImportAnimationClips
          rows={rows}
          selectedLocalId={selected?.localId ?? ""}
          canAdd
          onSelect={setSelectedLocalId}
          onAdd={addClip}
          onRemove={removeClip}
          onChange={(changes) => patch(setModelAnimationClipSettings(
            settings,
            selected!,
            changes,
          ))}
        />
      )}

      {settings.importAnimations && takes.length === 0 && (
        <p className="inspector-note">This model contains no animation clips.</p>
      )}
    </div>
  );
}
