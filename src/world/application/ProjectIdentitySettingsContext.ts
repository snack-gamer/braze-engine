import { createContext, useContext } from "react";
export type IdentitySettingsSection = "tags" | "layers";
export const ProjectIdentitySettingsContext = createContext<(section: IdentitySettingsSection) => void>(() => undefined);
export const useOpenIdentitySettings = () => useContext(ProjectIdentitySettingsContext);
