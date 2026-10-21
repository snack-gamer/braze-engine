import { useCallback, useEffect, useMemo, useState } from "react";
import { GAME_VIEW_BUILTIN_PRESETS, makeCustomGameViewPreset } from "./game-view-aspect";
import { persistGameViewAspectSettings, readGameViewAspectSettings } from "./game-view-preferences";

export function useGameViewSettings() {
  const [scale, setScale] = useState(1);
  const [showStats, setShowStats] = useState(true);
  const [aspectSettings, setAspectSettings] = useState(readGameViewAspectSettings);

  useEffect(() => {
    persistGameViewAspectSettings(aspectSettings);
  }, [aspectSettings]);

  const aspectPresets = useMemo(
    () => [...GAME_VIEW_BUILTIN_PRESETS, ...aspectSettings.customPresets],
    [aspectSettings.customPresets],
  );
  const activeAspectPreset = aspectPresets.find((preset) => preset.id === aspectSettings.activePresetId)
    ?? GAME_VIEW_BUILTIN_PRESETS[0];

  const selectAspectPreset = useCallback((activePresetId: string) => {
    setAspectSettings((current) => ({ ...current, activePresetId }));
  }, []);

  const setLowResolution = useCallback((lowResolution: boolean) => {
    setAspectSettings((current) => ({ ...current, lowResolution }));
  }, []);

  const addCustomResolution = useCallback((width: number, height: number) => {
    const preset = makeCustomGameViewPreset(width, height);
    if (!preset) return;
    setAspectSettings((current) => ({
      ...current,
      activePresetId: preset.id,
      customPresets: [...current.customPresets, preset].slice(-24),
    }));
  }, []);

  const toggleStats = useCallback(() => setShowStats((visible) => !visible), []);

  return {
    activeAspectPreset,
    addCustomResolution,
    aspectPresets,
    lowResolution: aspectSettings.lowResolution,
    scale,
    selectAspectPreset,
    setLowResolution,
    setScale,
    showStats,
    toggleStats,
  };
}
