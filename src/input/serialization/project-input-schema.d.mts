import type { ProjectInputSettings, CapturedProjectInput } from "../domain/input-action-map-asset";
export const EMPTY_PROJECT_INPUT: ProjectInputSettings;
export function decodeProjectInput(value: unknown): ProjectInputSettings;
export function encodeProjectInput(value: ProjectInputSettings): ProjectInputSettings;
export function decodeCapturedProjectInput(value: unknown): CapturedProjectInput | undefined;
