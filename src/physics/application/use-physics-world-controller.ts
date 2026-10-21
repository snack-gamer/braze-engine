import { useCallback, useRef, useState } from "react";
import {
  DEFAULT_PHYSICS_WORLD_SETTINGS,
  normalizePhysicsWorldSettings,
  type PhysicsWorldSettings,
} from "../domain/world-settings";

export type PhysicsWorldController = {
  settings: PhysicsWorldSettings;
  update: (patch: Partial<PhysicsWorldSettings>) => void;
  load: (settings: PhysicsWorldSettings) => void;
  capture: () => PhysicsWorldSettings;
  restore: (snapshot: PhysicsWorldSettings) => void;
};

/** Owns authored scene-wide physics settings and Play snapshot operations. */
export function usePhysicsWorldController(): PhysicsWorldController {
  const [settings, setSettings] = useState<PhysicsWorldSettings>(() => normalizePhysicsWorldSettings(DEFAULT_PHYSICS_WORLD_SETTINGS));
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const update = useCallback((patch: Partial<PhysicsWorldSettings>) => {
    setSettings((previous) => normalizePhysicsWorldSettings({ ...previous, ...patch }));
  }, []);
  const load = useCallback((next: PhysicsWorldSettings) => {
    setSettings(normalizePhysicsWorldSettings(next));
  }, []);
  const capture = useCallback(() => normalizePhysicsWorldSettings(settingsRef.current), []);
  const restore = useCallback((snapshot: PhysicsWorldSettings) => {
    setSettings(normalizePhysicsWorldSettings(snapshot));
  }, []);

  return { settings, update, load, capture, restore };
}
