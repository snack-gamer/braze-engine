import { useState } from "react";
import { InspectorSection } from "./scene/InspectorSection";
import type { LibraryAsset, ModelImportDocument } from "../lib/api";
import { useModelImportSettings } from "../hooks/useModelImportSettings";
import {
  EditorControlGroup,
  EditorIcon,
  EditorTabs,
} from "../ui";
import "./ModelImportSettingsPanel.css";
import type {
  MaterialImportMode,
  ModelImportSettings,
} from "../lib/model-import-settings";
import {
  ModelImportSelectRow,
  ModelImportToggleRow,
} from "./model-import/ModelImportControlRows";
import { ModelImportModelTab } from "./model-import/ModelImportModelTab";
import { ModelImportAnimationTab } from "./model-import/ModelImportAnimationTab";
import { CharacterRigImportTab } from "../character/components/CharacterRigImportTab";
import type { ModelImportAnimationPreviewSelection } from "./model-import/ModelImportAnimationPreview";

type Tab = "model" | "rig" | "animation" | "materials";

type Props = {
  asset: LibraryAsset;
  modelAssets?: readonly LibraryAsset[];
  onSaved?: (asset: LibraryAsset, doc: ModelImportDocument) => void;
  onAnimationPreviewChange?: (preview: ModelImportAnimationPreviewSelection | null | undefined) => void;
};

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "model", label: "Model" },
  { id: "rig", label: "Rig" },
  { id: "animation", label: "Animation" },
  { id: "materials", label: "Materials" },
];

type TabProps = {
  settings: ModelImportSettings;
  patch: (patch: Partial<ModelImportSettings>) => void;
};

function MaterialsTab({ settings, patch }: TabProps) {
  return (
    <EditorControlGroup
      id="asset.importSettings.materials.definition"
      title="Material Import"
      meta={settings.importMaterials ? "Enabled" : "Disabled"}
      note="Preserve keeps authored material slots. Import allows Braze material descriptors to be generated from those slots."
    >
      <ModelImportToggleRow label="Import Materials" checked={settings.importMaterials} onChange={(importMaterials) => patch({ importMaterials })} />
      <ModelImportSelectRow<MaterialImportMode>
        label="Material Mode"
        value={settings.materialMode}
        options={[
          { value: "preserve", label: "Preserve" },
          { value: "import", label: "Import" },
        ]}
        onChange={(materialMode) => patch({ materialMode })}
      />
    </EditorControlGroup>
  );
}

export function ModelImportSettingsPanel({
  asset,
  modelAssets = [],
  onSaved,
  onAnimationPreviewChange,
}: Props) {
  const [tab, setTab] = useState<Tab>("model");
  const importer = useModelImportSettings({ asset, enabled: true, onSaved });
  const status = importer.error
    ? importer.error
    : importer.saving
      ? "Applying import settings"
      : importer.recovered && importer.dirty
        ? "Recovered unsaved settings"
        : importer.dirty
          ? "Settings modified"
          : "No pending changes";
  const meta = importer.loading
    ? "Loading"
    : importer.recoveryConflict
      ? "Conflict"
      : importer.recovered && importer.dirty
        ? "Recovered"
        : importer.dirty ? "Modified" : "Ready";
  return (
    <InspectorSection
      id="asset.importSettings"
      title="Import Settings"
      icon={<EditorIcon name="refresh" size="compact" />}
      meta={meta}
      className="model-import"
      defaultOpen
    >
      <EditorTabs
        storageId="asset.importSettings"
        tabs={tabs}
        value={tab}
        onChange={setTab}
        ariaLabel="Model import settings"
      />
      <div className="model-import__grid">
        {tab === "model" && <ModelImportModelTab settings={importer.draft} patch={importer.patch} />}
        {tab === "rig" && (
          <CharacterRigImportTab
            asset={asset}
            modelAssets={modelAssets}
            settings={importer.draft}
            patch={importer.patch}
            commit={importer.commit}
            commitError={importer.error}
            committing={importer.saving}
          />
        )}
        {tab === "animation" && (
          <ModelImportAnimationTab
            asset={asset}
            settings={importer.draft}
            patch={importer.patch}
            onPreviewChange={onAnimationPreviewChange}
          />
        )}
        {tab === "materials" && <MaterialsTab settings={importer.draft} patch={importer.patch} />}
      </div>
      <footer className="model-import__footer">
        <div
          className={`inspector-note model-import__status ${importer.error ? "is-error" : ""}`}
          role="status"
          aria-live="polite"
        >
          {status}
        </div>
        <div className="model-import__actions">
          <button
            type="button"
            className="ghost-button"
            disabled={(!importer.dirty && !importer.recoveryConflict) || importer.saving}
            onClick={importer.revert}
          >
            <EditorIcon name="reset" size="compact" /> Revert
          </button>
          <button
            type="button"
            className="ghost-button accent"
            disabled={!importer.dirty || importer.saving || importer.recoveryConflict}
            onClick={importer.save}
          >
            <EditorIcon name="refresh" size="compact" /> {importer.saving ? "Reimporting" : "Apply & Reimport"}
          </button>
        </div>
      </footer>
    </InspectorSection>
  );
}
