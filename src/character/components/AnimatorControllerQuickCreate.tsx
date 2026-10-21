import { EditorIcon } from "../../ui/EditorIcon";
import { useCharacterPlaybackAssetCatalog } from "../application/CharacterPlaybackAssetProvider";
import { createAnimatorControllerFromClips } from "../application/animator-controller-seeding";
import { resolveImportedCharacterSubAsset, type ImportedCharacterAssetOption } from "../application/imported-character-assets";
import type { AnimatorComponent } from "../domain/animator-component";
import { createAnimatorController } from "../domain/animator-controller";

type AnimatorControllerQuickCreateProps = Readonly<{
  component: AnimatorComponent;
  clips: readonly ImportedCharacterAssetOption[];
  update: (component: AnimatorComponent) => void;
}>;

/** Seeds the scene-owned controller directly from this model's imported clips. */
export function AnimatorControllerQuickCreate({
  component,
  clips,
  update,
}: AnimatorControllerQuickCreateProps) {
  const playbackAssets = useCharacterPlaybackAssetCatalog();
  const assign = (controller: NonNullable<AnimatorComponent["controller"]>) => update({
    ...component,
    controller,
    controllerRef: undefined,
    parameterOverrides: [],
  });
  const createEmpty = () => assign(createAnimatorController("embedded-controller", "Animator Controller"));
  const createFromClips = () => {
    const sourceName = clips[0]?.sourceName ?? "Character";
    assign(createAnimatorControllerFromClips(
      clips.map((clip) => ({
        ref: clip.ref,
        name: resolveImportedCharacterSubAsset(
          playbackAssets.importedAssets,
          clip.ref,
        )?.subAsset.name || clip.label,
      })),
      `${sourceName} Controller`,
    ));
  };

  return (
    <div className="animator-controller-quick-create">
      <div className="animator-controller-quick-create__actions">
        {clips.length > 0 ? (
          <button type="button" className="ghost-button compact accent" onClick={createFromClips}>
            <EditorIcon name="animatorController" size="control" />
            Build from {clips.length} {clips.length === 1 ? "Clip" : "Clips"}
          </button>
        ) : (
          <button type="button" className="ghost-button compact accent" onClick={createEmpty}>
            <EditorIcon name="animatorController" size="control" />
            Create State Machine
          </button>
        )}
        {clips.length > 0 && (
          <button type="button" className="ghost-button compact" onClick={createEmpty}>
            Create Empty
          </button>
        )}
      </div>
      <small>
        {clips.length > 0
          ? "Creates one state per clip; the first is default."
          : "Creates an empty state machine."}
      </small>
    </div>
  );
}
