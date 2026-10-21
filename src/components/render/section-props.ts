import type { Dispatch, SetStateAction } from "react";
import type { EnvironmentSettings } from "../../types";

export type EnvSetterProps = {
  environment: EnvironmentSettings;
  setEnvironment: Dispatch<SetStateAction<EnvironmentSettings>>;
};
