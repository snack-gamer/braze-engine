import { memo } from "react";
import type { BoneId } from "../domain/skeleton";
import type { HumanoidMappingBone } from "../application/humanoid-mapping";
import { BoneSelect } from "./BoneSelect";
import "./RigRootControls.css";

type RigRootControlsProps = Readonly<{
  bones: readonly HumanoidMappingBone[];
  rootBoneId?: BoneId;
  motionRootBoneId?: BoneId;
  selectedBoneId: BoneId | null;
  onRootChange: (boneId: BoneId | undefined) => void;
  onMotionRootChange: (boneId: BoneId | undefined) => void;
  onSelectBone: (boneId: BoneId) => void;
  showBoneList?: boolean;
}>;

export const RigRootControls = memo(function RigRootControls({
  bones,
  rootBoneId,
  motionRootBoneId,
  selectedBoneId,
  onRootChange,
  onMotionRootChange,
  onSelectBone,
  showBoneList = false,
}: RigRootControlsProps) {
  return (
    <section className="avatar-configurator__card avatar-configurator__roots">
      <header><strong>Rig Roots</strong><span>{bones.length} bones</span></header>
      <p className="avatar-configurator__root-help">
        The Skeleton Root anchors the hierarchy. The Motion Root drives character movement and root motion—usually the hips.
      </p>
      <label className="avatar-configurator__field">
        <span>Skeleton Root</span>
        <BoneSelect bones={bones} value={rootBoneId} onChange={onRootChange} emptyLabel="Select skeleton root" />
      </label>
      <label className="avatar-configurator__field">
        <span>Motion Root</span>
        <BoneSelect bones={bones} value={motionRootBoneId} onChange={onMotionRootChange} emptyLabel="Use skeleton root" />
      </label>
      {showBoneList && (
        <div className="avatar-configurator__bone-list" role="list" aria-label="Imported bones">
          {bones.map((bone) => (
            <button
              type="button"
              role="listitem"
              key={bone.id}
              className={selectedBoneId === bone.id ? "active" : ""}
              style={{ paddingInlineStart: `${10 + Math.min(8, bone.path.split("/").length) * 7}px` }}
              onClick={() => onSelectBone(bone.id)}
              title={bone.path}
            >
              <span>{bone.name}</span><small>{bone.parentId ? "Bone" : "Root"}</small>
            </button>
          ))}
        </div>
      )}
    </section>
  );
});
