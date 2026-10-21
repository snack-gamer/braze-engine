import { memo, useMemo } from "react";
import { REQUIRED_HUMANOID_BONES, type HumanBoneMapping, type HumanoidBoneName } from "../domain/humanoid-avatar";
import type { BoneId } from "../domain/skeleton";
import { HUMANOID_BONE_GROUPS } from "../application/humanoid-bone-groups";
import { assignHumanoidBone, clearHumanoidBone } from "../application/humanoid-mapping-edits";
import { HUMANOID_REGION_SLOTS, type HumanoidMappingRegion } from "../application/humanoid-map-layout";
import { humanBoneLabel, type HumanoidMappingBone } from "../application/humanoid-mapping";
import { HumanoidBoneDropSlot } from "./HumanoidBoneDropSlot";
import "./HumanoidMappingPanel.css";

const REQUIRED = new Set<HumanoidBoneName>(REQUIRED_HUMANOID_BONES);

type HumanoidMappingPanelProps = Readonly<{
  bones: readonly HumanoidMappingBone[];
  mapping: HumanBoneMapping;
  region?: HumanoidMappingRegion;
  selectedBoneId?: BoneId | null;
  selectedHumanBone?: HumanoidBoneName | null;
  disabled?: boolean;
  onChange: (mapping: HumanBoneMapping) => void;
  onSelectBone: (boneId: BoneId) => void;
  onSelectHumanBone?: (bone: HumanoidBoneName) => void;
  onAutoMap: () => void;
}>;

export const HumanoidMappingPanel = memo(function HumanoidMappingPanel({
  bones,
  mapping,
  region = "body",
  selectedBoneId = null,
  selectedHumanBone = null,
  disabled = false,
  onChange,
  onSelectBone,
  onSelectHumanBone,
  onAutoMap,
}: HumanoidMappingPanelProps) {
  const totalCount = HUMANOID_BONE_GROUPS.reduce((count, group) => count + group.bones.length, 0);
  const mappedCount = HUMANOID_BONE_GROUPS.reduce(
    (count, group) => count + group.bones.filter((slot) => mapping[slot]).length,
    0,
  );
  const requiredMappedCount = REQUIRED_HUMANOID_BONES.filter((slot) => mapping[slot]).length;
  const visibleSlots = new Set(HUMANOID_REGION_SLOTS[region]);
  const boneById = useMemo(() => new Map(bones.map((bone) => [bone.id, bone])), [bones]);
  const assign = (slot: HumanoidBoneName, boneId: BoneId) => {
    onChange(assignHumanoidBone(mapping, slot, boneId));
    onSelectHumanBone?.(slot);
    onSelectBone(boneId);
  };
  return (
    <section
      className="avatar-configurator__card avatar-configurator__mapping"
      aria-labelledby="humanoid-mapping-title"
      aria-describedby={disabled ? undefined : "humanoid-mapping-help"}
    >
      <header>
        <span>
          <strong id="humanoid-mapping-title">Humanoid Mapping</strong>
          <small>{requiredMappedCount}/{REQUIRED.size} required · {mappedCount}/{totalCount} mapped</small>
        </span>
        <button
          type="button"
          className="ghost-button compact"
          onClick={onAutoMap}
          disabled={disabled || bones.length === 0}
          title="Automatically match Humanoid roles to bones in this model"
        >
          Auto Map
        </button>
      </header>
      {disabled && <p className="avatar-configurator__notice">This mapping is owned by the source Avatar. Braze validates skeleton compatibility when importing.</p>}
      {!disabled && (
        <div className="avatar-configurator__mapping-help" id="humanoid-mapping-help">
          <p>Drag bones from Skeleton into these roles. Select a Skeleton bone and click an empty slot for keyboard assignment.</p>
          <span><i aria-hidden="true" /> Required for a valid Avatar</span>
        </div>
      )}
      <div className="avatar-configurator__mapping-columns" aria-hidden="true">
        <span>Humanoid role</span>
        <span>Drop bone from Skeleton</span>
      </div>
      <div className="avatar-configurator__mapping-groups">
        {HUMANOID_BONE_GROUPS.map((group) => ({
          ...group,
          bones: group.bones.filter((slot) => visibleSlots.has(slot)),
        })).filter((group) => group.bones.length > 0).map((group) => {
          const groupMapped = group.bones.filter((slot) => mapping[slot]).length;
          const groupRequired = group.bones.filter((slot) => REQUIRED.has(slot));
          const groupRequiredMapped = groupRequired.filter((slot) => mapping[slot]).length;
          return (
            <details key={`${region}:${group.id}`} open>
              <summary>
                <span>{group.label}</span>
                <small>
                  {groupRequired.length > 0 && `${groupRequiredMapped}/${groupRequired.length} required · `}
                  {groupMapped}/{group.bones.length} mapped
                </small>
              </summary>
              <div>
                {group.bones.map((slot) => {
                  const mappedBone = mapping[slot];
                  const mappedBoneDefinition = mappedBone ? boneById.get(mappedBone) : undefined;
                  return (
                    <div
                      key={slot}
                      className={`avatar-configurator__mapping-row ${selectedHumanBone === slot ? "active" : ""}`}
                      data-state={mappedBoneDefinition ? "mapped" : "missing"}
                    >
                      <button
                        type="button"
                        className="avatar-configurator__mapping-role"
                        onClick={() => onSelectHumanBone?.(slot)}
                      >
                        {humanBoneLabel(slot)}
                        {REQUIRED.has(slot) && <i title="Required for a valid Avatar">●</i>}
                      </button>
                      <HumanoidBoneDropSlot
                        role={slot}
                        roleLabel={humanBoneLabel(slot)}
                        assignedBoneId={mappedBone}
                        bone={mappedBoneDefinition}
                        availableBones={boneById}
                        selectedBoneId={selectedBoneId}
                        disabled={disabled}
                        onAssign={(boneId) => assign(slot, boneId)}
                        onClear={() => {
                          onChange(clearHumanoidBone(mapping, slot));
                          onSelectHumanBone?.(slot);
                        }}
                        onSelectBone={onSelectBone}
                        onSelectRole={() => onSelectHumanBone?.(slot)}
                      />
                    </div>
                  );
                })}
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
});
