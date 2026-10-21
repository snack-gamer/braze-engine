import { useCallback, useMemo } from "react";
import { createAuthoredId } from "../identity/authored-id";
import {
  appendSequencerSection,
  appendSequencerTrack,
  removeSequencerSection,
  removeSequencerTrack,
  updateSequencerSection,
  updateSequencerTrack,
} from "./timeline-document-operations";
import type {
  SequencerSectionPatch,
  SequencerTrackCreateOptions,
  SequencerTrackPatch,
} from "./track-authoring";
import type { SequencerSectionKind, SequencerTrackKind } from "./types";
import type { TimelineDocumentSession } from "./useTimelineDocumentSession";

/** Sequencer track/section CRUD, including session-local authoring identifiers. */
export function useTimelineTrackAuthoring(session: TimelineDocumentSession) {
  const nextSequencerId = useCallback((prefix: string) => createAuthoredId(prefix), []);
  const addTrack = useCallback((
    kind: SequencerTrackKind = "activation",
    options: SequencerTrackCreateOptions = {},
  ) => {
    const trackId = nextSequencerId(`track-${kind}`);
    let sectionId = `${trackId}-section`;
    session.commitDocument((current) => {
      const appended = appendSequencerTrack(current, kind, options, trackId);
      sectionId = appended.sectionId;
      return { tracks: appended.tracks };
    }, { persist: true });
    return { trackId, sectionId };
  }, [nextSequencerId, session.commitDocument]);
  const removeTrack = useCallback((trackId: string) => {
    session.commitDocument((current) => ({
      tracks: removeSequencerTrack(current.tracks, trackId),
    }), { persist: true });
  }, [session.commitDocument]);
  const updateTrack = useCallback((trackId: string, patch: SequencerTrackPatch) => {
    session.commitDocument((current) => ({
      tracks: updateSequencerTrack(current.tracks, trackId, patch),
    }), { persist: true });
  }, [session.commitDocument]);
  const addSection = useCallback((trackId: string, kind?: SequencerSectionKind) => {
    const sectionId = nextSequencerId("section");
    session.commitDocument((current) => ({
      tracks: appendSequencerSection(current, trackId, sectionId, kind),
    }), { persist: true });
    return sectionId;
  }, [nextSequencerId, session.commitDocument]);
  const removeSection = useCallback((trackId: string, sectionId: string) => {
    session.commitDocument((current) => ({
      tracks: removeSequencerSection(current.tracks, trackId, sectionId),
    }), { persist: true });
  }, [session.commitDocument]);
  const updateSection = useCallback((
    trackId: string,
    sectionId: string,
    patch: SequencerSectionPatch,
  ) => {
    session.commitDocument((current) => ({
      tracks: updateSequencerSection(current.tracks, trackId, sectionId, patch),
    }), { persist: true });
  }, [session.commitDocument]);

  return useMemo(() => ({
    addSequencerSection: addSection,
    addSequencerTrack: addTrack,
    removeSequencerSection: removeSection,
    removeSequencerTrack: removeTrack,
    updateSequencerSection: updateSection,
    updateSequencerTrack: updateTrack,
  }), [addSection, addTrack, removeSection, removeTrack, updateSection, updateTrack]);
}
