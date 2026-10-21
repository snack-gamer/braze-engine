import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { LibraryAsset } from "../../lib/api";
import type { HumanBoneMapping, HumanoidBoneName, HumanoidPoseTuning } from "../domain/humanoid-avatar";
import { normalizeRigImportSettings, type RigImportSettings } from "../domain/rig";
import type { BoneId } from "../domain/skeleton";
import {
  suggestHumanoidMapping,
} from "../application/humanoid-mapping";
import {
  initializeRigFromSkeleton,
  validateConfiguredRig,
} from "../application/avatar-configuration";
import type { CharacterPreviewAnalysis } from "../adapters/three/three-character-preview-extension";
import type { CharacterPreviewCanvasHandle } from "./CharacterPreviewCanvas";
import { AvatarConfiguratorHeader } from "./AvatarConfiguratorHeader";
import { AvatarConfigurationSettings } from "./AvatarConfigurationSettings";
import { CharacterPreviewWorkspace } from "./CharacterPreviewWorkspace";
import { AvatarWorkspaceTabs, type AvatarWorkspaceTab } from "./AvatarWorkspaceTabs";
import { SkeletonHierarchyPanel } from "./SkeletonHierarchyPanel";
import "./AvatarConfigurator.css";

const EMPTY_BONES = [] as const;

type AvatarConfiguratorProps = Readonly<{
  asset: LibraryAsset;
  rig: Exclude<RigImportSettings, { kind: "none" }>;
  copySourceAvailable?: boolean;
  saving?: boolean;
  saveError?: string;
  returnFocusRef?: RefObject<HTMLElement | null>;
  onApply: (rig: RigImportSettings) => Promise<void>;
  onClose: () => void;
}>;

export function AvatarConfigurator({
  asset,
  rig,
  copySourceAvailable = true,
  saving = false,
  saveError = "",
  returnFocusRef,
  onApply,
  onClose,
}: AvatarConfiguratorProps) {
  const previewRef = useRef<CharacterPreviewCanvasHandle>(null);
  const panelRef = useRef<HTMLElement>(null);
  const initializedSkeleton = useRef<string | null>(null);
  const [draft, setDraft] = useState<RigImportSettings>(rig);
  const [analysis, setAnalysis] = useState<CharacterPreviewAnalysis | null>(null);
  const [selectedBoneId, setSelectedBoneId] = useState<BoneId | null>(null);
  const [selectedHumanBone, setSelectedHumanBone] = useState<HumanoidBoneName | null>(null);
  const [workspaceTab, setWorkspaceTab] = useState<AvatarWorkspaceTab>(rig.kind === "humanoid" ? "mapping" : "settings");
  const definition = analysis?.extraction.definition ?? null;
  const bones = definition?.bones ?? EMPTY_BONES;

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.classList.add("avatar-configurator-open");
    panelRef.current?.focus();
    return () => {
      document.body.classList.remove("avatar-configurator-open");
      document.body.style.overflow = previousOverflow;
      window.setTimeout(() => {
        const focusTarget = returnFocusRef?.current ?? previousFocus;
        if (focusTarget?.isConnected) focusTarget.focus();
      }, 0);
    };
  }, [returnFocusRef]);

  useEffect(() => {
    if (!definition || initializedSkeleton.current === definition.id) return;
    initializedSkeleton.current = definition.id;
    setDraft((current) => initializeRigFromSkeleton(
      current,
      definition.bones,
      analysis!.extraction.rootCandidates,
      analysis!.extraction.skins.map((skin) => skin.boneIds),
    ));
  }, [analysis, definition]);

  const validation = useMemo(
    () => validateConfiguredRig(draft, bones, Boolean(definition), { copySourceAvailable }),
    [bones, copySourceAvailable, definition, draft],
  );
  const diagnostics = useMemo(
    () => [...(analysis?.extraction.diagnostics ?? []), ...validation.issues],
    [analysis, validation],
  );
  const patchDraft = useCallback((patch: Record<string, unknown>) => {
    setDraft((current) => normalizeRigImportSettings({ ...current, ...patch }));
  }, []);
  const humanBoneByBoneId = useMemo(() => {
    const output = new Map<BoneId, HumanoidBoneName>();
    if (draft.kind !== "humanoid") return output;
    for (const [humanBone, boneId] of Object.entries(draft.humanBoneMapping) as Array<[HumanoidBoneName, BoneId]>) {
      if (boneId) output.set(boneId, humanBone);
    }
    return output;
  }, [draft]);
  const selectBone = useCallback((boneId: BoneId) => {
    setSelectedBoneId(boneId);
    setSelectedHumanBone(humanBoneByBoneId.get(boneId) ?? null);
    previewRef.current?.setSelectedBone(boneId);
  }, [humanBoneByBoneId]);
  const selectHumanBone = useCallback((humanBone: HumanoidBoneName) => {
    setSelectedHumanBone(humanBone);
    if (draft.kind !== "humanoid") return;
    const boneId = draft.humanBoneMapping[humanBone];
    if (!boneId) return;
    setSelectedBoneId(boneId);
    previewRef.current?.setSelectedBone(boneId);
  }, [draft]);
  const updateRootBone = useCallback((rootBoneId: BoneId | undefined) => {
    patchDraft({ rootBoneId });
  }, [patchDraft]);
  const updateMotionRootBone = useCallback((motionRootBoneId: BoneId | undefined) => {
    patchDraft({ motionRootBoneId });
  }, [patchDraft]);
  const updateHumanoidMapping = useCallback((humanBoneMapping: HumanBoneMapping) => {
    patchDraft({ humanBoneMapping });
  }, [patchDraft]);
  const updateHumanoidTuning = useCallback((humanoidTuning: HumanoidPoseTuning) => {
    patchDraft({ humanoidTuning });
  }, [patchDraft]);
  const changeWorkspaceTab = useCallback((tab: AvatarWorkspaceTab) => {
    if (tab !== "preview") previewRef.current?.setPlaying(false);
    setWorkspaceTab(tab);
  }, []);
  const autoMapHumanoid = useCallback(() => {
    const suggestion = suggestHumanoidMapping(bones, {
      boneGroups: analysis?.extraction.skins.map((skin) => skin.boneIds),
    });
    patchDraft({
      humanBoneMapping: suggestion.mapping,
      rootBoneId: suggestion.rootBoneId ?? (draft.kind === "none" ? undefined : draft.rootBoneId),
      motionRootBoneId: suggestion.mapping.hips ?? (draft.kind === "none" ? undefined : draft.motionRootBoneId),
    });
  }, [analysis, bones, draft, patchDraft]);

  return createPortal(
    <div className="avatar-configurator" role="dialog" aria-modal="true" aria-labelledby="avatar-configurator-title">
      <section
        ref={panelRef}
        className="avatar-configurator__panel"
        tabIndex={-1}
        onContextMenu={(event) => event.preventDefault()}
      >
        <AvatarConfiguratorHeader
          assetName={asset.name}
          mode={rig.kind}
          validationStatus={validation.status}
          onClose={onClose}
        />

        <main className="avatar-configurator__workspace">
          <SkeletonHierarchyPanel
            bones={bones}
            mapping={draft.kind === "humanoid" ? draft.humanBoneMapping : undefined}
            dragEnabled={draft.kind === "humanoid"
              && draft.avatarSource.kind === "createFromModel"
              && workspaceTab === "mapping"}
            selectedBoneId={selectedBoneId}
            onSelectBone={selectBone}
          />
          <section className="avatar-configurator__editor">
            <AvatarWorkspaceTabs
              activeTab={workspaceTab}
              humanoid={draft.kind === "humanoid"}
              onChange={changeWorkspaceTab}
            />
            <aside className="avatar-configurator__settings" hidden={workspaceTab === "preview"}>
              {draft.kind !== "none" && (
                <AvatarConfigurationSettings
                  tab={workspaceTab === "settings" ? "settings" : "mapping"}
                  rig={draft}
                  bones={bones}
                  diagnostics={diagnostics}
                  selectedBoneId={selectedBoneId}
                  selectedHumanBone={selectedHumanBone}
                  mappingDisabled={draft.kind === "humanoid" && draft.avatarSource.kind === "copyFromAvatar"}
                  onRootChange={updateRootBone}
                  onMotionRootChange={updateMotionRootBone}
                  onMappingChange={updateHumanoidMapping}
                  onTuningChange={updateHumanoidTuning}
                  onSelectBone={selectBone}
                  onSelectHumanBone={selectHumanBone}
                  onAutoMap={autoMapHumanoid}
                  onResetPose={() => previewRef.current?.resetPose()}
                />
              )}
            </aside>
            <CharacterPreviewWorkspace
              ref={previewRef}
              asset={asset}
              clips={analysis?.clips ?? []}
              hidden={workspaceTab !== "preview"}
              onAnalysis={setAnalysis}
              onBoneSelected={selectBone}
            />
          </section>
        </main>

        <footer className="avatar-configurator__footer">
          <span className={saveError ? "avatar-configurator__save-error" : ""} role="status">
            {saveError || "Commits this importer draft."}
          </span>
          <div>
            <button type="button" className="ghost-button" disabled={saving} onClick={onClose}>Cancel</button>
            <button
              type="button"
              className="ghost-button compact accent"
              disabled={validation.status === "invalid" || saving}
              onClick={() => void onApply(draft).then(onClose).catch(() => undefined)}
            >
              {saving ? "Saving…" : "Save & Reimport"}
            </button>
          </div>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
