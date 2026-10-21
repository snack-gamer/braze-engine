import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SceneObject } from "../types";
import {
  findSelectedSection,
  isUserSequencerTrack,
  type SelectedSequencerSection,
} from "./sequencer-presentation";
import type { SequencerSectionPatch } from "./track-authoring";
import type { SequencerTrack } from "./types";
import type { PrimeTimelineController } from "./usePrimeTimeline";

/** Selection, menu lifecycle, and object-aware authoring commands for the sequencer surface. */
export function useSequencerAuthoring(
  controller: PrimeTimelineController,
  objects: SceneObject[],
  activeObjectId: string,
) {
  const [selected, setSelected] = useState<SelectedSequencerSection | null>(null);
  const [trackMenuOpen, setTrackMenuOpen] = useState(false);
  const trackMenuRef = useRef<HTMLDivElement | null>(null);
  const visibleTracks = useMemo(
    () => controller.document.tracks.filter(isUserSequencerTrack),
    [controller.document.tracks],
  );
  const selectedObject = useMemo(
    () => objects.find((object) => object.id === activeObjectId) ?? null,
    [activeObjectId, objects],
  );
  const selectedItem = useMemo(
    () => findSelectedSection(visibleTracks, selected),
    [selected, visibleTracks],
  );

  useEffect(() => {
    if (selectedItem || visibleTracks.length === 0) return;
    const firstTrack = visibleTracks.find((track) => track.sections.length > 0);
    const firstSection = firstTrack?.sections[0];
    setSelected(firstTrack && firstSection ? { trackId: firstTrack.id, sectionId: firstSection.id } : null);
  }, [selectedItem, visibleTracks]);
  useEffect(() => {
    if (!selected || visibleTracks.some((track) => track.id === selected.trackId)) return;
    setSelected(null);
  }, [selected, visibleTracks]);
  useEffect(() => {
    if (!trackMenuOpen) return undefined;
    const onPointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (target && trackMenuRef.current?.contains(target)) return;
      setTrackMenuOpen(false);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setTrackMenuOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [trackMenuOpen]);

  const addObjectTrack = useCallback((kind: "animation" | "activation") => {
    if (!selectedObject) return;
    const existing = visibleTracks.find((track) => (
      track.kind === kind && track.targetObjectId === selectedObject.id
    ));
    if (existing?.sections[0]) {
      setSelected({ trackId: existing.id, sectionId: existing.sections[0].id });
      setTrackMenuOpen(false);
      return;
    }
    const isVisibility = kind === "activation";
    const added = controller.addSequencerTrack(kind, {
      name: selectedObject.name || selectedObject.id,
      targetObjectId: selectedObject.id,
      sectionKind: isVisibility ? "activation" : "animation",
      sectionName: isVisibility ? "Visible" : "Animation",
    });
    setSelected({ trackId: added.trackId, sectionId: added.sectionId });
    setTrackMenuOpen(false);
  }, [controller, selectedObject, visibleTracks]);
  const addSection = useCallback((track: SequencerTrack) => {
    const sectionId = controller.addSequencerSection(track.id);
    setSelected({ trackId: track.id, sectionId });
  }, [controller]);
  const updateSection = useCallback((patch: SequencerSectionPatch) => {
    if (!selectedItem) return;
    controller.updateSequencerSection(selectedItem.track.id, selectedItem.section.id, patch);
  }, [controller, selectedItem]);
  const clearSelection = useCallback(() => setSelected(null), []);
  const selectSection = useCallback((trackId: string, sectionId: string) => {
    setSelected({ trackId, sectionId });
  }, []);
  const toggleTrackMenu = useCallback(() => setTrackMenuOpen((open) => !open), []);
  const selectedTargetName = selectedItem?.section.targetObjectId
    ? objects.find((object) => object.id === selectedItem.section.targetObjectId)?.name
      ?? selectedItem.section.targetObjectId
    : "";

  return {
    addObjectTrack,
    addSection,
    clearSelection,
    selectSection,
    selected,
    selectedItem,
    selectedObject,
    selectedTargetName,
    toggleTrackMenu,
    trackMenuOpen,
    trackMenuRef,
    updateSection,
    visibleTracks,
  };
}
