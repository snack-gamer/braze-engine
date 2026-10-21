import { useRef } from "react";
import type { LibraryAsset } from "../../lib/api";
import {
  WORLD_SOURCE_META,
  WORLD_SOURCE_OPTIONS,
} from "../../rendering/authoring/world-editor-model";
import type { WorldSource } from "../../types";
import { EditorIcon } from "../../ui/EditorIcon";
import { InspectorTabs } from "../InspectorTabs";
import { InspectorSection } from "../scene/InspectorSection";
import type { EnvSetterProps } from "./section-props";
import { HdriWorldControls } from "./world/HdriWorldControls";
import { SkyWorldControls } from "./world/SkyWorldControls";

type WorldSectionProps = EnvSetterProps & {
  hdris: LibraryAsset[];
  uploadHdri: (file: File) => Promise<LibraryAsset | null>;
  removeHdri: (filename: string) => Promise<void>;
};

export function WorldSection({
  environment,
  setEnvironment,
  hdris,
  uploadHdri,
  removeHdri,
}: WorldSectionProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mode = environment.worldSource;
  const setMode = (worldSource: WorldSource) => {
    setEnvironment((env) => ({ ...env, worldSource }));
  };

  return (
    <InspectorSection
      id="render.world"
      title="World"
      icon={<EditorIcon name="world" size="control" />}
      meta={WORLD_SOURCE_META[mode]}
      actions={mode === "hdri" ? (
        <button
          type="button"
          className="link-button"
          onClick={() => fileInputRef.current?.click()}
          title="Upload .hdr or .exr"
        >
          <EditorIcon name="upload" size="compact" /> Upload
        </button>
      ) : undefined}
    >
      <InspectorTabs
        storageId="render.world.source"
        tabs={WORLD_SOURCE_OPTIONS}
        value={mode}
        onChange={setMode}
        ariaLabel="World source"
      />
      {mode === "hdri" && (
        <HdriWorldControls
          environment={environment}
          setEnvironment={setEnvironment}
          hdris={hdris}
          fileInputRef={fileInputRef}
          uploadHdri={uploadHdri}
          removeHdri={removeHdri}
        />
      )}
      {mode === "sky" && (
        <SkyWorldControls environment={environment} setEnvironment={setEnvironment} />
      )}
    </InspectorSection>
  );
}
