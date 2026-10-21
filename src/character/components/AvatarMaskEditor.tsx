import { EditorIcon } from "../../ui/EditorIcon";
import {
  addAvatarMaskTransform,
  patchAvatarMaskTransform,
  removeAvatarMaskTransform,
  setHumanoidBodyPartActive,
} from "../application/avatar-mask-authoring";
import {
  HUMANOID_BODY_PARTS,
  type AvatarMaskAsset,
  type HumanoidBodyPart,
} from "../domain/avatar-mask";
import type { AuthoredAvatarMask } from "../domain/character-asset-library";
import { CommittedTextInput } from "./CommittedTextInput";
import "./AvatarMaskEditor.css";

type AvatarMaskEditorProps = Readonly<{
  mask: AuthoredAvatarMask;
  onChange: (mask: AvatarMaskAsset) => void;
  onDelete: () => void;
}>;

const BODY_PART_LABELS: Record<HumanoidBodyPart, string> = {
  root: "Root",
  body: "Body",
  head: "Head",
  leftArm: "Left Arm",
  rightArm: "Right Arm",
  leftHand: "Left Hand",
  rightHand: "Right Hand",
  leftLeg: "Left Leg",
  rightLeg: "Right Leg",
};

export function AvatarMaskEditor({ mask, onChange, onDelete }: AvatarMaskEditorProps) {
  return (
    <div className="avatar-mask-editor">
      <header className="avatar-mask-editor__title">
        <EditorIcon name="avatar" size="control" />
        <CommittedTextInput
          className="avatar-mask-editor__title-name"
          value={mask.name}
          ariaLabel="Avatar Mask name"
          onCommit={(name) => onChange({ ...mask, name })}
        />
        <span>Avatar Mask</span>
        <button type="button" className="icon-button danger" title="Delete Avatar Mask" onClick={onDelete}>
          <EditorIcon name="delete" size="control" />
        </button>
      </header>
      <section className="avatar-mask-editor__card">
        <header><strong>Humanoid Body</strong><span>Semantic regions</span></header>
        <div className="avatar-mask-editor__body-parts">
          {HUMANOID_BODY_PARTS.map((part) => (
            <label key={part}>
              <input
                type="checkbox"
                checked={mask.humanoidBodyParts[part] !== false}
                onChange={(event) => onChange(setHumanoidBodyPartActive(mask, part, event.currentTarget.checked))}
              />
              {BODY_PART_LABELS[part]}
            </label>
          ))}
        </div>
      </section>
      <section className="avatar-mask-editor__card avatar-mask-editor__transforms">
        <header>
          <strong>Transform Paths</strong>
          <button type="button" className="ghost-button compact" onClick={() => onChange(addAvatarMaskTransform(
            mask,
            `Root/Transform ${mask.transforms.length + 1}`,
          ))}><EditorIcon name="add" size="row-action" /> Add</button>
        </header>
        <p>Optional root-relative paths refine the mask for Generic rigs and extra bones.</p>
        {mask.transforms.map((transform, index) => (
          <div className="avatar-mask-transform-row" key={`${transform.path}:${index}`}>
            <input
              type="checkbox"
              checked={transform.active}
              aria-label={`${transform.path} active`}
              onChange={(event) => onChange(patchAvatarMaskTransform(mask, index, {
                active: event.currentTarget.checked,
              }))}
            />
            <CommittedTextInput
              value={transform.path}
              ariaLabel={`Transform path ${index + 1}`}
              onCommit={(path) => onChange(patchAvatarMaskTransform(mask, index, { path }))}
            />
            <button
              type="button"
              className="icon-button compact danger"
              title="Delete transform path"
              onClick={() => onChange(removeAvatarMaskTransform(mask, index))}
            ><EditorIcon name="delete" size="row-action" /></button>
          </div>
        ))}
        {mask.transforms.length === 0 && (
          <p className="avatar-mask-editor__empty">Humanoid body regions are enough for most masks.</p>
        )}
      </section>
    </div>
  );
}
