import type { ChangeEvent, RefObject } from "react";
import type { LibraryAsset } from "../../../lib/api";
import { formatAssetSize } from "../../../rendering/authoring/world-editor-model";
import type { EnvironmentSettings } from "../../../types";
import { EditorIcon } from "../../../ui/EditorIcon";
import { InspectorRow } from "../../InspectorRow";
import { InspectorSlider } from "../../InspectorSlider";
import type { EnvSetterProps } from "../section-props";

type HdriWorldControlsProps = {
  environment: EnvironmentSettings;
  setEnvironment: EnvSetterProps["setEnvironment"];
  hdris: LibraryAsset[];
  fileInputRef: RefObject<HTMLInputElement | null>;
  uploadHdri: (file: File) => Promise<LibraryAsset | null>;
  removeHdri: (filename: string) => Promise<void>;
};

export function HdriWorldControls({
  environment,
  setEnvironment,
  hdris,
  fileInputRef,
  uploadHdri,
  removeHdri,
}: HdriWorldControlsProps) {
  const pickFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    void uploadHdri(file).then((uploaded) => {
      if (!uploaded) return;
      setEnvironment((env) => ({
        ...env,
        hdriUrl: uploaded.url,
        hdriName: uploaded.name,
      }));
    });
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".hdr,.exr"
        style={{ display: "none" }}
        onChange={pickFile}
      />
      <InspectorRow label="Environment">
        <select
          value={environment.hdriUrl ?? ""}
          onChange={(event) => {
            const url = event.target.value || null;
            const match = hdris.find((hdri) => hdri.url === url);
            setEnvironment((env) => ({
              ...env,
              hdriUrl: url,
              hdriName: match?.name ?? null,
            }));
          }}
        >
          <option value="">— no HDRI selected —</option>
          {hdris.map((hdri) => (
            <option key={hdri.filename} value={hdri.url}>
              {hdri.name} · {formatAssetSize(hdri.sizeBytes)}
            </option>
          ))}
        </select>
      </InspectorRow>

      {environment.hdriUrl && (
        <InspectorRow
          label="File"
          actions={(
            <button
              type="button"
              className="icon-button toolbar-button"
              title="Delete from library"
              onClick={() => {
                const filename = hdris.find((hdri) => hdri.url === environment.hdriUrl)?.filename;
                if (!filename) return;
                void removeHdri(filename).then(() => {
                  setEnvironment((env) => ({ ...env, hdriUrl: null, hdriName: null }));
                });
              }}
            >
              <EditorIcon name="delete" size="compact" />
            </button>
          )}
        >
          <code className="path-code">{environment.hdriName}</code>
        </InspectorRow>
      )}

      <InspectorRow label="Intensity">
        <InspectorSlider
          value={environment.intensity}
          min={0} max={2} step={0.01} decimals={2}
          ariaLabel="Intensity"
          onChange={(value) => setEnvironment((env) => ({ ...env, intensity: value }))}
        />
      </InspectorRow>
      <InspectorRow label="Rotation">
        <InspectorSlider
          value={environment.rotationDeg}
          min={-180} max={180} step={1} decimals={0} unit="°"
          ariaLabel="Rotation"
          onChange={(value) => setEnvironment((env) => ({ ...env, rotationDeg: value }))}
        />
      </InspectorRow>
    </>
  );
}
