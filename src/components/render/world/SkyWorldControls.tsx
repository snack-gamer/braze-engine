import {
  skyEditorTabIds,
  skyEditorTabs,
  type SkyEditorTab,
} from "../../../rendering/authoring/world-editor-model";
import type { EnvironmentSettings } from "../../../types";
import { InspectorTabs, useInspectorTab } from "../../InspectorTabs";
import type { EnvSetterProps } from "../section-props";
import { SkyAtmosphereControls } from "./SkyAtmosphereControls";
import { SkyCloudControls } from "./SkyCloudControls";
import { SkyFogControls } from "./SkyFogControls";
import { SkyGalaxyControls } from "./SkyGalaxyControls";
import { SkyPostFxControls } from "./SkyPostFxControls";

type SkyWorldControlsProps = {
  environment: EnvironmentSettings;
  setEnvironment: EnvSetterProps["setEnvironment"];
};

export function SkyWorldControls({ environment, setEnvironment }: SkyWorldControlsProps) {
  const availableTabs = skyEditorTabs();
  const availableIds = skyEditorTabIds();
  const [activeTab, setActiveTab] = useInspectorTab<SkyEditorTab>(
    "render.sky.section",
    availableIds,
    "atmosphere",
  );
  const setSky = (patch: Partial<EnvironmentSettings["sky"]>) => {
    setEnvironment((env) => ({ ...env, sky: { ...env.sky, ...patch } }));
  };
  const controls = {
    sky: environment.sky,
    setSky,
  };

  return (
    <>
      <InspectorTabs
        storageId="render.sky.section"
        tabs={availableTabs}
        value={activeTab}
        onChange={setActiveTab}
        ariaLabel="Sky section"
      />
      {activeTab === "atmosphere" && <SkyAtmosphereControls {...controls} />}
      {activeTab === "clouds" && <SkyCloudControls {...controls} />}
      {activeTab === "fog" && <SkyFogControls {...controls} />}
      {activeTab === "postfx" && <SkyPostFxControls {...controls} />}
      {activeTab === "galaxy" && <SkyGalaxyControls {...controls} />}
    </>
  );
}
