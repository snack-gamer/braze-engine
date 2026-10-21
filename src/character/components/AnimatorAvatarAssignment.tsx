import { InspectorRow } from "../../components/InspectorRow";
import { assignAnimatorAvatarReference } from "../application/animator-component-authoring";
import {
  characterAssetOptionKey,
  characterAssetOptionReference,
  type ImportedCharacterAssetOption,
} from "../application/imported-character-assets";
import type { AnimatorComponent } from "../domain/animator-component";

type AnimatorAvatarAssignmentProps = Readonly<{
  component: AnimatorComponent;
  avatars: readonly ImportedCharacterAssetOption[];
  update: (component: AnimatorComponent) => void;
}>;

/** Assigns an imported rig Avatar; the controller state machine is scene-owned. */
export function AnimatorAvatarAssignment({
  component,
  avatars,
  update,
}: AnimatorAvatarAssignmentProps) {
  const avatarValue = characterAssetOptionKey(component.avatarRef);
  const avatarAvailable = !avatarValue || avatars.some((avatar) => (
    characterAssetOptionKey(avatar.ref) === avatarValue
  ));
  return (
    <InspectorRow label="Avatar">
      <select
        aria-label="Animator Avatar"
        value={avatarValue}
        onChange={(event) => update(assignAnimatorAvatarReference(
          component,
          characterAssetOptionReference(event.currentTarget.value, avatars),
        ))}
      >
        <option value="">Use Model Rig</option>
        {!avatarAvailable && <option value={avatarValue}>Missing Avatar</option>}
        {avatars.map((avatar) => (
          <option key={characterAssetOptionKey(avatar.ref)} value={characterAssetOptionKey(avatar.ref)}>
            {avatar.label}
          </option>
        ))}
      </select>
    </InspectorRow>
  );
}
