function finite(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function validSourceIndex(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function settingsRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

/** Projects one normalized importer clip setting onto source-analysis facts. */
export function configuredAnimationClipRecord(entry, rawSettings, importAnimations) {
  const settings = settingsRecord(rawSettings);
  const sourceIndex = validSourceIndex(entry.sourceIndex);
  const configuredSourceIndex = validSourceIndex(settings.sourceIndex);
  const ownsSourceTake = sourceIndex !== null && configuredSourceIndex === sourceIndex;
  const sourceFirstFrame = finite(entry.sourceFirstFrame ?? entry.firstFrame);
  const sourceLastFrame = finite(entry.sourceLastFrame ?? entry.lastFrame);
  const frameRate = finite(entry.frameRate);
  const configuredFirstFrame = finite(settings.firstFrame);
  const configuredLastFrame = finite(settings.lastFrame);
  const hasSourceRange = sourceFirstFrame !== null
    && sourceLastFrame !== null
    && sourceLastFrame > sourceFirstFrame
    && frameRate !== null
    && frameRate > 0;
  const hasConfiguredRange = ownsSourceTake
    && configuredFirstFrame !== null
    && configuredLastFrame !== null
    && configuredLastFrame > configuredFirstFrame;
  const firstFrame = hasSourceRange && hasConfiguredRange
    ? Math.min(sourceLastFrame, Math.max(sourceFirstFrame, configuredFirstFrame))
    : sourceFirstFrame;
  const lastFrame = hasSourceRange && hasConfiguredRange
    ? Math.min(sourceLastFrame, Math.max(sourceFirstFrame, configuredLastFrame))
    : sourceLastFrame;
  const validRange = firstFrame !== null && lastFrame !== null && lastFrame > firstFrame;
  const durationSeconds = validRange && frameRate
    ? (lastFrame - firstFrame) / frameRate
    : finite(entry.sourceDurationSeconds ?? entry.durationSeconds);
  const authoredName = ownsSourceTake && typeof settings.name === "string"
    ? settings.name.trim()
    : "";
  const looping = typeof settings.looping === "boolean"
    ? settings.looping
    : entry.sourceLooping !== false && entry.looping !== false;
  const sourceEvents = Array.isArray(settings.events)
    ? settings.events.map((event) => ({ ...event, payload: { ...settingsRecord(event.payload) } }))
    : Array.isArray(entry.events)
      ? entry.events
      : null;
  const events = sourceEvents?.map((event) => ({
    ...event,
    timeSeconds: durationSeconds === null
      ? event.timeSeconds
      : Math.min(durationSeconds, event.timeSeconds),
  })) ?? null;
  return {
    ...entry,
    name: authoredName || entry.sourceName || entry.name,
    looping,
    importEnabled: importAnimations,
    ...(events ? { events } : {}),
    ...(validRange ? { firstFrame, lastFrame } : {}),
    ...(durationSeconds !== null ? { durationSeconds } : {}),
    inspectorValues: {
      ...entry.inspectorValues,
      ...(validRange ? { Start: firstFrame, End: lastFrame } : {}),
      ...(durationSeconds !== null ? { Duration: `${durationSeconds.toFixed(2)} s` } : {}),
      "Loop Time": looping ? "Yes" : "No",
      Imported: importAnimations ? "Yes" : "No",
    },
  };
}

/** Publishes source clips plus any additional authored segments in runtime order. */
export function configuredAnimationClipRecords(sourceEntries, rawClipSettings, importAnimations) {
  const sources = Array.isArray(sourceEntries) ? sourceEntries : [];
  const clipSettings = settingsRecord(rawClipSettings);
  const sourceLocalIds = new Set(sources.map((source) => source.localId));
  const sourceByIndex = new Map(sources.flatMap((source) => {
    const sourceIndex = validSourceIndex(source.sourceIndex);
    return sourceIndex === null ? [] : [[sourceIndex, source]];
  }));
  const fallbackSegmentBase = Math.max(0, ...sources.map((source) => (
    validSourceIndex(source.sourceIndex) ?? -1
  ))) + 1;
  const segmentBase = Math.max(
    fallbackSegmentBase,
    ...sources.map((source) => validSourceIndex(source.runtimeSegmentBaseIndex) ?? 0),
  );
  const sourceClips = sources.flatMap((source) => {
    const settings = settingsRecord(clipSettings[source.localId]);
    if (settings.enabled === false) return [];
    const runtimeClipIndex = validSourceIndex(source.sourceIndex);
    return [configuredAnimationClipRecord({
      ...source,
      clipOrigin: "source",
      sourceTakeLocalId: source.localId,
      ...(runtimeClipIndex !== null ? { runtimeClipIndex } : {}),
    }, settings, importAnimations)];
  });
  const segmentSettings = Object.entries(clipSettings)
    .filter(([localId, settings]) => (
      localId.startsWith("clip:")
      && !sourceLocalIds.has(localId)
      && settingsRecord(settings).kind === "segment"
      && settingsRecord(settings).enabled !== false
    ))
    .sort(([left], [right]) => left.localeCompare(right));
  let nextRuntimeClipIndex = segmentBase;
  const segments = segmentSettings.flatMap(([localId, rawSettings]) => {
    const settings = settingsRecord(rawSettings);
    const sourceIndex = validSourceIndex(settings.sourceIndex);
    const source = sourceIndex === null ? null : sourceByIndex.get(sourceIndex);
    if (!source) return [];
    if (typeof settings.sourceTakeLocalId === "string"
      && settings.sourceTakeLocalId.trim()
      && settings.sourceTakeLocalId.trim() !== source.localId) return [];
    const runtimeClipIndex = nextRuntimeClipIndex;
    nextRuntimeClipIndex += 1;
    return [configuredAnimationClipRecord({
      ...source,
      localId,
      clipOrigin: "segment",
      sourceTakeLocalId: source.localId,
      runtimeClipIndex,
    }, settings, importAnimations)];
  });
  return [...sourceClips, ...segments];
}
