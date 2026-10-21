import { DEFAULT_CHARACTER_CONTROL_SETTINGS, type CharacterControlActions,
  type CharacterControlLookSettings, type CharacterControlSettings } from "./character-control-settings";
import { DEFAULT_STOCK_CAMERA_SETTINGS, type StockCameraSettings } from "../../camera/domain/stock-camera-policy";

export type StockCharacterControlSettings = Readonly<{ control: CharacterControlSettings; camera: StockCameraSettings }>;
export type StockCharacterControlOptions = Readonly<{
  actions?: Partial<CharacterControlActions>;
  locomotion?: Partial<CharacterControlSettings["locomotion"]>;
  look?: Partial<CharacterControlLookSettings>;
  camera?: Partial<StockCameraSettings>;
}>;
const preset = (look: Partial<CharacterControlLookSettings>, camera: Partial<StockCameraSettings>): StockCharacterControlSettings => Object.freeze({
  control: Object.freeze({ ...DEFAULT_CHARACTER_CONTROL_SETTINGS,
    look: Object.freeze({ ...DEFAULT_CHARACTER_CONTROL_SETTINGS.look, ...look }) }),
  camera: Object.freeze({ ...DEFAULT_STOCK_CAMERA_SETTINGS, ...camera }),
});
export const DEFAULT_FIRST_PERSON_CONTROL_SETTINGS = preset({}, { distance: 0 });
export const DEFAULT_THIRD_PERSON_CONTROL_SETTINGS = preset({ initialPitch: 20, pitchMin: -70, pitchMax: 80 }, {});
export const DEFAULT_TOP_DOWN_CONTROL_SETTINGS = preset({ initialPitch: 60, pitchMin: 20, pitchMax: 85 }, { distance: 8 });

/** Generated settings capture; saved behavior values are validated at their existing owner. */
export function resolveStockCharacterControlSettings(defaults: StockCharacterControlSettings, options: StockCharacterControlOptions = {}): StockCharacterControlSettings {
  return Object.freeze({ control: Object.freeze({ actions: Object.freeze({ ...defaults.control.actions, ...options.actions }),
    locomotion: Object.freeze({ ...defaults.control.locomotion, ...options.locomotion }),
    look: Object.freeze({ ...defaults.control.look, ...options.look }) }),
    camera: Object.freeze({ ...defaults.camera, ...options.camera }) });
}
