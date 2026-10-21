import { useMemo, useRef, useState } from "react";
import type { LibraryAsset } from "../../lib/api";
import type { ModelImportSettings } from "../../lib/model-import-settings";
import {
  normalizeRigImportSettings,
  type BoneInfluenceLimit,
  type RigKind,
} from "../domain/rig";
import { EditorControlGroup, EditorPropertyRow } from "../../ui";
import {
  ModelImportSelectRow,
  ModelImportToggleRow,
} from "../../components/model-import/ModelImportControlRows";
import { EditorIcon } from "../../ui/EditorIcon";
import { primaryImportedRigSummary } from "../application/imported-rig-summary";
import {
  characterAssetOptionKey,
  importedHumanoidMapping,
  importedHumanoidTuning,
  isPlayableImportedAvatar,
  resolveImportedCharacterSubAsset,
  reusableHumanoidAvatarOptions,
} from "../application/imported-character-assets";
import { AvatarConfigurator } from "./AvatarConfigurator";
import "./CharacterRigImportTab.css";

type CharacterRigImportTabProps = {
  asset: LibraryAsset;
  modelAssets: readonly LibraryAsset[];
  settings: ModelImportSettings;
  patch: (patch: Partial<ModelImportSettings>) => void;
  commit: (patch: Partial<ModelImportSettings>) => Promise<void>;
  commitError: string;
  committing: boolean;
};

function rigLabel(kind: RigKind): string {
  if (kind === "humanoid") return "Humanoid";
  if (kind === "generic") return "Generic";
  return "None";
}

export function CharacterRigImportTab({
  asset,
  modelAssets,
  settings,
  patch,
  commit,
  commitError,
  committing,
}: CharacterRigImportTabProps) {
  const [configureOpen, setConfigureOpen] = useState(false);
  const configureButtonRef = useRef<HTMLButtonElement>(null);
  const rig = settings.rig;
  const detectedAvatar = primaryImportedRigSummary(asset);
  const configuredAvatar = (asset.subAssets ?? []).some((subAsset) => (
    subAsset.configuredRigKind === rig.kind && isPlayableImportedAvatar(subAsset)
  ));
  let rigStatusTitle = "Validation required";
  let rigStatusDetail = "Open Configure to inspect the loaded skeleton and choose its roots.";
  if (detectedAvatar) {
    const skins = detectedAvatar.skinCount || 1;
    rigStatusTitle = "Skeleton detected";
    rigStatusDetail = `${detectedAvatar.bones.length} bones across ${skins} skin${skins === 1 ? "" : "s"} will be validated when configured.`;
  }
  if (configuredAvatar) {
    rigStatusTitle = `${rig.kind === "humanoid" ? "Avatar" : "Rig"} configured`;
    rigStatusDetail = `The saved ${rigLabel(rig.kind)} definition is active for this model.`;
  }
  const reusableAvatars = useMemo(
    () => reusableHumanoidAvatarOptions(modelAssets, asset.filename),
    [asset.filename, modelAssets],
  );

  const patchRig = (next: Record<string, unknown>) => {
    patch({ rig: normalizeRigImportSettings({ ...rig, ...next }) });
  };
  const copyAvatar = (avatarRef: NonNullable<(typeof reusableAvatars)[number]>["ref"]) => {
    const source = resolveImportedCharacterSubAsset(modelAssets, avatarRef);
    patchRig({
      avatarSource: { kind: "copyFromAvatar", avatarRef },
      humanBoneMapping: source ? importedHumanoidMapping(source.subAsset) : {},
      humanoidTuning: source ? importedHumanoidTuning(source.subAsset) : undefined,
    });
  };
  const copiedAvatarKey = rig.kind === "humanoid" && rig.avatarSource.kind === "copyFromAvatar"
    ? characterAssetOptionKey(rig.avatarSource.avatarRef)
    : "";
  const copySourceAvailable = !copiedAvatarKey || reusableAvatars.some((candidate) => (
    characterAssetOptionKey(candidate.ref) === copiedAvatarKey
  ));

  return (
    <div className="character-rig-import-tab">
      <EditorControlGroup
        id="asset.importSettings.rig.definition"
        title="Rig Definition"
        meta={rigLabel(rig.kind)}
        note="Generic preserves an arbitrary skeleton. Humanoid adds a validated semantic Avatar for animation retargeting."
      >
        <ModelImportSelectRow<RigKind>
          label="Animation Type"
          value={rig.kind}
          options={[
            { value: "none", label: "None" },
            { value: "generic", label: "Generic" },
            { value: "humanoid", label: "Humanoid" },
          ]}
          onChange={(kind) => patchRig({ kind })}
        />

        {rig.kind !== "none" && (
          <div className={`character-rig-status character-rig-status--${detectedAvatar ? "detected" : "pending"}`}>
            <EditorIcon name={detectedAvatar ? "check" : "warning"} size="control" />
            <span>
              <strong>{rigStatusTitle}</strong>
              <small>{rigStatusDetail}</small>
            </span>
          </div>
        )}

        {rig.kind === "humanoid" && (
          <>
            <ModelImportSelectRow<"createFromModel" | "copyFromAvatar">
              label="Avatar Definition"
              value={rig.avatarSource.kind}
              options={[
                { value: "createFromModel", label: "Create From This Model" },
                { value: "copyFromAvatar", label: "Copy From Another Avatar" },
              ]}
              onChange={(kind) => {
                if (kind === "createFromModel" || !reusableAvatars[0]) {
                  patchRig({ avatarSource: { kind: "createFromModel" } });
                  return;
                }
                copyAvatar(reusableAvatars[0].ref);
              }}
            />
            {rig.avatarSource.kind === "copyFromAvatar" && (
              <EditorPropertyRow label="Source Avatar">
                <select
                  aria-label="Source Avatar"
                  value={copiedAvatarKey}
                  onChange={(event) => {
                    const selected = reusableAvatars.find((candidate) => (
                      characterAssetOptionKey(candidate.ref) === event.currentTarget.value
                    ));
                    if (!selected) return;
                    copyAvatar(selected.ref);
                  }}
                >
                  {reusableAvatars.length === 0 && <option value="">No compatible Avatars</option>}
                  {reusableAvatars.map((candidate) => (
                    <option key={characterAssetOptionKey(candidate.ref)} value={characterAssetOptionKey(candidate.ref)}>
                      {candidate.label}
                    </option>
                  ))}
                </select>
              </EditorPropertyRow>
            )}
            {rig.avatarSource.kind === "copyFromAvatar" && !copySourceAvailable && (
              <div className="character-rig-status character-rig-status--pending" role="alert">
                <EditorIcon name="warning" size="control" />
                <span><strong>Source Avatar missing</strong><small>Choose another valid configured Avatar before applying this rig.</small></span>
              </div>
            )}
          </>
        )}

        {rig.kind !== "none" && (
          <button
            ref={configureButtonRef}
            type="button"
            className="ghost-button accent character-rig-configure"
            aria-haspopup="dialog"
            aria-expanded={configureOpen}
            onClick={() => setConfigureOpen(true)}
          >
            <EditorIcon name="avatar" size="control" /> Configure {rig.kind === "humanoid" ? "Avatar" : "Rig"}
          </button>
        )}
      </EditorControlGroup>

      <EditorControlGroup
        id="asset.importSettings.rig.skinning"
        title="Skinning"
        meta={`${rig.maxBoneInfluences} weights`}
        note="Weights above this limit are pruned and renormalized during import. Four is the recommended quality setting."
      >
        <ModelImportSelectRow<BoneInfluenceLimit>
          label="Max Influences"
          value={rig.maxBoneInfluences}
          options={[
            { value: 1, label: "1 Bone" },
            { value: 2, label: "2 Bones" },
            { value: 4, label: "4 Bones" },
          ]}
          onChange={(maxBoneInfluences) => patchRig({ maxBoneInfluences })}
        />
        <ModelImportToggleRow
          label="Import Blend Shapes"
          checked={rig.importBlendShapes}
          onChange={(importBlendShapes) => patchRig({ importBlendShapes })}
        />
      </EditorControlGroup>

      {configureOpen && rig.kind !== "none" && (
        <AvatarConfigurator
          asset={asset}
          rig={rig}
          copySourceAvailable={copySourceAvailable}
          saveError={commitError}
          saving={committing}
          returnFocusRef={configureButtonRef}
          onApply={(nextRig) => commit({ rig: nextRig })}
          onClose={() => setConfigureOpen(false)}
        />
      )}
    </div>
  );
}
