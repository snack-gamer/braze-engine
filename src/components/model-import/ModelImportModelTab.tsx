import type {
  ModelImportSettings,
  NormalCalculationMode,
  NormalImportMode,
  SmoothnessSource,
  SourceUnit,
} from "../../lib/model-import-settings";
import {
  EditorControlGroup,
  EditorNumberField,
  EditorPropertyRow,
} from "../../ui";
import {
  ModelImportSelectRow,
  ModelImportToggleRow,
} from "./ModelImportControlRows";
import "./ModelImportModelTab.css";

type ModelImportModelTabProps = {
  settings: ModelImportSettings;
  patch: (patch: Partial<ModelImportSettings>) => void;
};

export function ModelImportModelTab({ settings, patch }: ModelImportModelTabProps) {
  return (
    <div className="model-import-model-tab">
      <EditorControlGroup
        id="asset.importSettings.model.scale"
        title="Scale & Units"
        meta={settings.fitToEditorSize ? "Normalized" : "Authored"}
        note="Fit to Editor normalizes unusually large or small assets to a practical working size. Turn it off to preserve the authored scale."
      >
        <EditorPropertyRow label="Scale">
          <EditorNumberField
            value={settings.scaleFactor}
            min={0.0001}
            step={0.01}
            decimals={4}
            ariaLabel="Model scale"
            onChange={(scaleFactor) => patch({ scaleFactor })}
          />
        </EditorPropertyRow>
        <ModelImportToggleRow
          label="Fit to Editor"
          checked={settings.fitToEditorSize}
          onChange={(fitToEditorSize) => patch({ fitToEditorSize })}
        />
        <ModelImportToggleRow
          label="Convert Units"
          checked={settings.convertUnits}
          onChange={(convertUnits) => patch({ convertUnits })}
        />
        {settings.convertUnits && (
          <ModelImportSelectRow<SourceUnit>
            label="Source Units"
            value={settings.sourceUnit}
            options={[
              { value: "centimeter", label: "Centimeters" },
              { value: "meter", label: "Meters" },
            ]}
            onChange={(sourceUnit) => patch({ sourceUnit })}
          />
        )}
      </EditorControlGroup>

      <EditorControlGroup
        id="asset.importSettings.model.content"
        title="Included Content"
        note="Choose which authored scene data is kept when the model is imported. Meshes are always included."
      >
        <ModelImportToggleRow
          label="Keep Source Visibility"
          checked={settings.importVisibility}
          onChange={(importVisibility) => patch({ importVisibility })}
        />
        <ModelImportToggleRow
          label="Include Cameras"
          checked={settings.importCameras}
          onChange={(importCameras) => patch({ importCameras })}
        />
        <ModelImportToggleRow
          label="Include Lights"
          checked={settings.importLights}
          onChange={(importLights) => patch({ importLights })}
        />
      </EditorControlGroup>

      <EditorControlGroup
        id="asset.importSettings.model.structure"
        title="Object Structure"
      >
        <ModelImportToggleRow
          label="Preserve Hierarchy"
          checked={settings.preserveHierarchy}
          onChange={(preserveHierarchy) => patch({ preserveHierarchy })}
        />
        <ModelImportToggleRow
          label="Sort Children by Name"
          checked={settings.sortHierarchyByName}
          onChange={(sortHierarchyByName) => patch({ sortHierarchyByName })}
        />
      </EditorControlGroup>

      <EditorControlGroup
        id="asset.importSettings.model.normals"
        title="Surface Shading"
        meta={settings.normals === "import" ? "From file" : "Recalculated"}
        note="Keep normals from the source file unless the model has missing or incorrect surface shading."
      >
        <ModelImportSelectRow<NormalImportMode>
          label="Normals"
          value={settings.normals}
          options={[
            { value: "import", label: "From File" },
            { value: "calculate", label: "Recalculate" },
          ]}
          onChange={(normals) => patch({ normals })}
        />
        {settings.normals === "calculate" && (
          <>
            <ModelImportSelectRow<NormalCalculationMode>
              label="Weighting"
              value={settings.normalCalculationMode}
              options={[
                { value: "unweighted", label: "Equal" },
                { value: "areaWeighted", label: "Face Area" },
                { value: "angleWeighted", label: "Corner Angle" },
                { value: "areaAndAngleWeighted", label: "Area & Angle" },
              ]}
              onChange={(normalCalculationMode) => patch({ normalCalculationMode })}
            />
            <ModelImportSelectRow<SmoothnessSource>
              label="Smoothing"
              value={settings.smoothnessSource}
              options={[
                { value: "fromAngle", label: "By Angle" },
                { value: "none", label: "All Shared Faces" },
              ]}
              onChange={(smoothnessSource) => patch({ smoothnessSource })}
            />
            {settings.smoothnessSource === "fromAngle" && (
              <EditorPropertyRow label="Smooth Angle">
                <EditorNumberField
                  value={settings.smoothingAngle}
                  min={0}
                  max={180}
                  step={1}
                  decimals={0}
                  unit="deg"
                  ariaLabel="Smooth angle"
                  onChange={(smoothingAngle) => patch({ smoothingAngle })}
                />
              </EditorPropertyRow>
            )}
          </>
        )}
      </EditorControlGroup>
    </div>
  );
}
