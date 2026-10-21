import { useMemo } from "react";
import type { AssetRef } from "../../assets/domain/asset-reference";
import { InspectorRow } from "../../components/InspectorRow";
import { InspectorToggle } from "../../components/InspectorToggle";
import { SceneComponentIdentity } from "../../components/scene/SceneComponentPresentation";
import { EditorIcon } from "../../ui/EditorIcon";
import {
  useCharacterAssetAuthoring,
} from "../application/CharacterAssetLibraryProvider";
import { useCharacterPlaybackAssetCatalog } from "../application/CharacterPlaybackAssetProvider";
import {
  characterAssetOptionKey,
  importedAnimationClipOptions,
  playableImportedAvatarOptions,
} from "../application/imported-character-assets";
import { embedAnimatorController } from "../application/animator-component-authoring";
import { characterAssetReference } from "../domain/character-asset-library";
import type {
  AnimatorComponent,
} from "../domain/animator-component";
import {
  animatorStateMachinesInLayer,
  animatorStatesInLayer,
} from "../domain/animator-state-machine";
import { AnimatorAvatarAssignment } from "./AnimatorAvatarAssignment";
import { AnimatorControllerQuickCreate } from "./AnimatorControllerQuickCreate";
import { AnimatorParameterOverrides } from "./AnimatorParameterOverrides";
import { AnimatorPlaybackSettings } from "./AnimatorPlaybackSettings";
import "./AnimatorComponentEditor.css";

type AnimatorComponentEditorProps = {
  component: AnimatorComponent;
  modelGuid?: string;
  readOnlyReason?: string;
  update: (component: AnimatorComponent) => void;
  remove: () => void;
  onOpenController: () => void;
};

function humanizeLocalId(localId: string): string {
  const segment = localId.split(":").filter(Boolean).pop() ?? "";
  return segment
    .replace(/[-_/]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

export function readableAnimatorAssetReference(
  reference: AssetRef | undefined,
  kind: "controller" | "avatar",
): string {
  if (!reference) return "Not assigned";
  const localName = reference.localId ? humanizeLocalId(reference.localId) : "";
  const opaqueLocalName = /^[a-f0-9]{24,}$/i.test(localName.replace(/\s/g, ""));
  if (!localName || localName.toLowerCase() === "main" || opaqueLocalName) {
    return `Assigned ${kind}`;
  }
  return localName;
}

export function AnimatorComponentEditor({
  component,
  modelGuid,
  readOnlyReason,
  update,
  remove,
  onOpenController,
}: AnimatorComponentEditorProps) {
  const characterAssets = useCharacterAssetAuthoring();
  const playbackAssets = useCharacterPlaybackAssetCatalog();
  const avatars = useMemo(
    () => playableImportedAvatarOptions(playbackAssets.importedAssets, modelGuid),
    [modelGuid, playbackAssets.importedAssets],
  );
  const modelClips = useMemo(() => modelGuid
    ? importedAnimationClipOptions(playbackAssets.importedAssets.filter(
      (asset) => asset.guid?.toLowerCase() === modelGuid.toLowerCase(),
    ))
    : [], [modelGuid, playbackAssets.importedAssets]);
  const legacyController = characterAssets.animatorControllers.find((controller) => (
    characterAssetOptionKey(characterAssetReference(controller))
      === characterAssetOptionKey(component.controllerRef)
  ));
  const controller = component.controllerRef ? legacyController : component.controller;
  const patch = (next: Partial<AnimatorComponent>) => update({ ...component, ...next });
  const updateController = (next: NonNullable<AnimatorComponent["controller"]>) => update(
    embedAnimatorController(component, next),
  );

  return (
    <div className="component-card animator-component-card">
      <div className="component-card__head">
        <span>
          <SceneComponentIdentity componentId="animator" />
        </span>
        <button
          className="icon-button danger"
          type="button"
          title="Remove Animator Controller"
          onClick={remove}
        >
          <EditorIcon name="delete" size="control" />
        </button>
      </div>

      {readOnlyReason && (
        <div className="animator-component-read-only" role="status">
          <EditorIcon name="warning" size="compact" />
          <span>
            <strong>Animator Controller settings are read only.</strong> {readOnlyReason}
            {" "}Saved settings remain intact.
          </span>
        </div>
      )}

      <fieldset
        className="animator-component-controls"
        disabled={Boolean(readOnlyReason)}
        aria-label={readOnlyReason ? "Unsupported Animator Controller settings" : "Animator Controller settings"}
      >
        <InspectorRow label="Enabled">
          <InspectorToggle
            checked={component.enabled}
            ariaLabel="Animator enabled"
            onChange={(enabled) => patch({ enabled })}
          />
        </InspectorRow>
        <InspectorRow label="State Machine">
          <button
            type="button"
            className="ghost-button compact animator-controller-edit-button"
            disabled={!controller}
            onClick={() => {
              if (!controller) return;
              if (!component.controller || component.controllerRef) updateController(controller);
              onOpenController();
            }}
          >
            <EditorIcon name="animatorController" size="compact" />
            {controller?.name ?? "Missing legacy controller"}
            {controller && <small>{controller.layers.length}L · {controller.layers.reduce(
              (sum, layer) => sum + animatorStatesInLayer(layer).length,
              0,
            )}S</small>}
          </button>
        </InspectorRow>
        <AnimatorAvatarAssignment
          component={component}
          avatars={avatars}
          update={update}
        />
        {(!controller || (modelClips.length > 0
          && controller.layers.every((layer) => (
            animatorStatesInLayer(layer).length === 0
            && animatorStateMachinesInLayer(layer).length === 0
          )))) && (
          <AnimatorControllerQuickCreate component={component} clips={modelClips} update={update} />
        )}
        {controller && (
          <AnimatorParameterOverrides
            component={component}
            parameters={controller.parameters}
            update={update}
          />
        )}
        <AnimatorPlaybackSettings component={component} update={update} />
      </fieldset>
    </div>
  );
}
