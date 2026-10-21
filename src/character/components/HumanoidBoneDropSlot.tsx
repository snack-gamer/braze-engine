import { useState, type DragEvent } from "react";
import { EditorIcon } from "../../ui/EditorIcon";
import type { HumanoidMappingBone } from "../application/humanoid-mapping";
import type { HumanoidBoneName } from "../domain/humanoid-avatar";
import type { BoneId } from "../domain/skeleton";
import { hasSkeletonBoneDrag, readSkeletonBoneDrag } from "./skeleton-bone-drag-data";

type HumanoidBoneDropSlotProps = Readonly<{
  role: HumanoidBoneName;
  roleLabel: string;
  assignedBoneId: BoneId | undefined;
  bone: HumanoidMappingBone | undefined;
  availableBones: ReadonlyMap<BoneId, HumanoidMappingBone>;
  selectedBoneId: BoneId | null;
  disabled: boolean;
  onAssign: (boneId: BoneId) => void;
  onClear: () => void;
  onSelectBone: (boneId: BoneId) => void;
  onSelectRole: () => void;
}>;

/** One explicit bone assignment target shared by pointer drag/drop and keyboard selection. */
export function HumanoidBoneDropSlot({
  role,
  roleLabel,
  assignedBoneId,
  bone,
  availableBones,
  selectedBoneId,
  disabled,
  onAssign,
  onClear,
  onSelectBone,
  onSelectRole,
}: HumanoidBoneDropSlotProps) {
  const [dragOver, setDragOver] = useState(false);
  const acceptDrag = (event: DragEvent<HTMLDivElement>) => {
    if (disabled || !hasSkeletonBoneDrag(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDragOver(true);
  };
  const assignDrop = (event: DragEvent<HTMLDivElement>) => {
    if (disabled) return;
    event.preventDefault();
    setDragOver(false);
    const boneId = readSkeletonBoneDrag(event.dataTransfer, availableBones);
    if (boneId) onAssign(boneId);
  };
  const activate = () => {
    onSelectRole();
    if (bone) onSelectBone(bone.id);
    else if (selectedBoneId && availableBones.has(selectedBoneId)) onAssign(selectedBoneId);
  };
  const state = bone ? "mapped" : "missing";
  const assignment = bone
    ? `${bone.name}, ${bone.path}`
    : assignedBoneId
      ? `missing source bone ${assignedBoneId}`
      : "unassigned; drop a Skeleton bone here";

  return (
    <div
      className="humanoid-bone-drop-slot"
      data-state={state}
      data-drag-over={dragOver || undefined}
      data-role={role}
      onDragEnter={acceptDrag}
      onDragOver={acceptDrag}
      onDragLeave={(event) => {
        const related = event.relatedTarget;
        if (!(related instanceof Node) || !event.currentTarget.contains(related)) setDragOver(false);
      }}
      onDrop={assignDrop}
    >
      <button
        type="button"
        className="humanoid-bone-drop-slot__target"
        disabled={disabled}
        aria-label={`${roleLabel}: ${assignment}`}
        title={bone?.path ?? (selectedBoneId ? "Use the selected Skeleton bone or drop another bone" : "Drag a bone here from Skeleton")}
        onClick={activate}
        onKeyDown={(event) => {
          if (!bone || (event.key !== "Delete" && event.key !== "Backspace")) return;
          event.preventDefault();
          onClear();
        }}
      >
        <EditorIcon name="object" size="compact" />
        <span>
          <strong>{bone?.name ?? (assignedBoneId ? "Missing bone" : "Drop bone here")}</strong>
          <small>{bone?.path ?? assignedBoneId ?? (selectedBoneId ? "Click to use selected bone" : "Drag from Skeleton")}</small>
        </span>
      </button>
      {assignedBoneId && !disabled && (
        <button
          type="button"
          className="humanoid-bone-drop-slot__clear"
          aria-label={`Clear ${roleLabel} mapping`}
          title={`Clear ${roleLabel} mapping`}
          onClick={onClear}
        >
          <EditorIcon name="close" size="compact" />
        </button>
      )}
    </div>
  );
}
