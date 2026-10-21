import type { Dispatch, SetStateAction } from "react";
import { EditorIcon } from "../ui/EditorIcon";
import { defaultEnvironment } from "../constants";
import type { LibraryAsset } from "../lib/api";
import type { EnvironmentSettings } from "../types";
import { ScreenSpaceEffectsSection } from "./render/ScreenSpaceEffectsSection";
import { ToneMappingSection } from "./render/ToneMappingSection";
import { WorldSection } from "./render/WorldSection";
import { PanelHeader } from "./scene/PanelHeader";

type RenderSettingsPanelProps = {
  environment: EnvironmentSettings;
  setEnvironment: Dispatch<SetStateAction<EnvironmentSettings>>;
  hdris: LibraryAsset[];
  uploadHdri: (file: File) => Promise<LibraryAsset | null>;
  removeHdri: (filename: string) => Promise<void>;
};

export function RenderSettingsPanel(props: RenderSettingsPanelProps) {
  const {
    environment,
    setEnvironment,
    hdris,
    uploadHdri,
    removeHdri,
  } = props;

  // Reset every tunable parameter back to its default value, but PRESERVE
  // the chosen HDRI. Re-picking the HDRI is a separate, explicit action
  // (and the asset library is an external file the user uploaded), so we
  // treat it as outside the "settings" surface — like Blender's
  // "Reset to Defaults" leaves the world texture alone.
  const resetSettings = () => {
    setEnvironment((env) => ({
      ...defaultEnvironment,
      hdriUrl: env.hdriUrl,
      hdriName: env.hdriName,
    }));
  };

  return (
    <>
      <PanelHeader
        title="Render Settings"
        tone="rendering"
        icon={<EditorIcon name="inspector" size="control" />}
        actions={(
          <button
            type="button"
            className="link-button"
            onClick={resetSettings}
            title="Reset all render settings to defaults (keeps the selected HDRI)"
          >
            <EditorIcon name="reset" size="compact" /> Reset
          </button>
        )}
      />

      <WorldSection
        environment={environment}
        setEnvironment={setEnvironment}
        hdris={hdris}
        uploadHdri={uploadHdri}
        removeHdri={removeHdri}
      />

      <ScreenSpaceEffectsSection environment={environment} setEnvironment={setEnvironment} />

      <ToneMappingSection environment={environment} setEnvironment={setEnvironment} />
    </>
  );
}
