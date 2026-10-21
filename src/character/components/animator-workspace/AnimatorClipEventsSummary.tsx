import { requestAnimationClipEditor } from "../../../animation/application/animation-clip-editor-channel";
import type { ImportedCharacterAssetOption } from "../../application/imported-character-assets";
import type { AnimatorStateEvent } from "../../domain/animator-controller";
import "./AnimatorClipEventsSummary.css";

export function AnimatorClipEventsSummary({
  clip,
  stateEvents,
}: Readonly<{
  clip: ImportedCharacterAssetOption | undefined;
  stateEvents: readonly AnimatorStateEvent[];
}>) {
  const clipEvents = clip?.events ?? [];
  const eventCount = clipEvents.length + stateEvents.length;
  const open = (eventId?: string) => {
    if (!clip?.ref.localId) return;
    requestAnimationClipEditor({
      filename: clip.sourceFilename,
      localId: clip.ref.localId,
      ...(eventId ? { eventId } : {}),
    });
  };
  return <section className="animator-clip-events-summary">
    <header><strong>Clip Events</strong><span>{eventCount}</span></header>
    {clipEvents.map((event) => <button
      type="button"
      key={`clip:${event.id}`}
      className="animator-clip-events-summary__event"
      title="Open in Animation"
      onClick={() => open(event.id)}
    ><span>{event.name}</span><small>{event.timeSeconds.toFixed(2)} s</small></button>)}
    {stateEvents.map((event) => <div
      key={`state:${event.id}`}
      className="animator-clip-events-summary__event animator-clip-events-summary__event--state"
      data-event-source="state"
      title="State event · stored on this Behavior Map"
    ><span>{event.name}</span><small>{normalizedPercent(event.timeNormalized)}</small></div>)}
    {eventCount === 0 && <p>
      {clip ? "Double-click this Clip to add events in Animation." : "Assign an imported Clip to view its events."}
    </p>}
  </section>;
}

function normalizedPercent(value: number): string {
  const percent = Math.min(1, Math.max(0, value)) * 100;
  return `${Number.isInteger(percent) ? percent.toFixed(0) : percent.toFixed(1)}%`;
}
