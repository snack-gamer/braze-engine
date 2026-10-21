import { memo, useEffect, useState } from "react";
import type { CharacterDiagnostic } from "../domain/diagnostics";
import type { HumanBoneMapping, HumanoidBoneName, HumanoidPoseTuning } from "../domain/humanoid-avatar";
import type { RigImportSettings } from "../domain/rig";
import type { BoneId } from "../domain/skeleton";
import { type HumanoidMappingRegion } from "../application/humanoid-map-layout";
import type { HumanoidMappingBone } from "../application/humanoid-mapping";
import { AvatarDiagnosticSummary } from "./AvatarDiagnosticSummary";
import { HumanoidMapOverview } from "./HumanoidMapOverview";
import { HumanoidMappingPanel } from "./HumanoidMappingPanel";
import { HumanoidTuningPanel } from "./HumanoidTuningPanel";
import { RigRootControls } from "./RigRootControls";

type ConfiguredRig = Exclude<RigImportSettings, { kind: "none" }>;

type AvatarConfigurationSettingsProps = Readonly<{
  tab: "mapping" | "settings";
  rig: ConfiguredRig;
  bones: readonly HumanoidMappingBone[];
  diagnostics: readonly CharacterDiagnostic[];
  selectedBoneId: BoneId | null;
  selectedHumanBone: HumanoidBoneName | null;
  mappingDisabled: boolean;
  onRootChange: (boneId: BoneId | undefined) => void;
  onMotionRootChange: (boneId: BoneId | undefined) => void;
  onMappingChange: (mapping: HumanBoneMapping) => void;
  onTuningChange: (tuning: HumanoidPoseTuning) => void;
  onSelectBone: (boneId: BoneId) => void;
  onSelectHumanBone: (bone: HumanoidBoneName) => void;
  onAutoMap: () => void;
  onResetPose: () => void;
}>;

export const AvatarConfigurationSettings = memo(function AvatarConfigurationSettings({
  tab,
  rig,
  bones,
  diagnostics,
  selectedBoneId,
  selectedHumanBone,
  mappingDisabled,
  onRootChange,
  onMotionRootChange,
  onMappingChange,
  onTuningChange,
  onSelectBone,
  onSelectHumanBone,
  onAutoMap,
  onResetPose,
}: AvatarConfigurationSettingsProps) {
  const [region, setRegion] = useState<HumanoidMappingRegion>("body");

  useEffect(() => {
    if (!selectedHumanBone) return;
    if (selectedHumanBone.startsWith("left") && /Thumb|Index|Middle|Ring|Little/.test(selectedHumanBone)) {
      setRegion("leftHand");
    } else if (selectedHumanBone.startsWith("right") && /Thumb|Index|Middle|Ring|Little/.test(selectedHumanBone)) {
      setRegion("rightHand");
    } else if (["leftEye", "rightEye", "jaw"].includes(selectedHumanBone)) {
      setRegion("head");
    }
  }, [selectedHumanBone]);

  if (rig.kind === "generic") {
    return (
      <>
        <RigRootControls
          bones={bones}
          rootBoneId={rig.rootBoneId}
          motionRootBoneId={rig.motionRootBoneId}
          selectedBoneId={selectedBoneId}
          showBoneList={false}
          onRootChange={onRootChange}
          onMotionRootChange={onMotionRootChange}
          onSelectBone={onSelectBone}
        />
        <AvatarDiagnosticSummary diagnostics={diagnostics} />
      </>
    );
  }

  return (
    <>
      {tab === "mapping" ? (
        <>
          <HumanoidMapOverview
            mapping={rig.humanBoneMapping}
            selectedBone={selectedHumanBone}
            region={region}
            onSelectBone={onSelectHumanBone}
            onRegionChange={setRegion}
          />
          <HumanoidMappingPanel
            bones={bones}
            mapping={rig.humanBoneMapping}
            region={region}
            selectedBoneId={selectedBoneId}
            selectedHumanBone={selectedHumanBone}
            disabled={mappingDisabled}
            onChange={onMappingChange}
            onSelectBone={onSelectBone}
            onSelectHumanBone={onSelectHumanBone}
            onAutoMap={onAutoMap}
          />
          <AvatarDiagnosticSummary diagnostics={diagnostics} />
        </>
      ) : (
        <>
          <RigRootControls
            bones={bones}
            rootBoneId={rig.rootBoneId}
            motionRootBoneId={rig.motionRootBoneId}
            selectedBoneId={selectedBoneId}
            showBoneList={false}
            onRootChange={onRootChange}
            onMotionRootChange={onMotionRootChange}
            onSelectBone={onSelectBone}
          />
          <HumanoidTuningPanel tuning={rig.humanoidTuning} onChange={onTuningChange} onResetPose={onResetPose} />
          <AvatarDiagnosticSummary diagnostics={diagnostics} />
        </>
      )}
    </>
  );
});
