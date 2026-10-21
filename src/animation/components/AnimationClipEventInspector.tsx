import type { AnimationClipEventInspectorBinding } from "../application/animation-clip-event-inspector";
import { InspectorGrid } from "../../components/InspectorGrid";
import { InspectorRow } from "../../components/InspectorRow";
import { PanelHeader } from "../../components/scene/PanelHeader";
import { EditorIcon } from "../../ui/EditorIcon";
import "./AnimationClipEventInspector.css";

type AnimationClipEventInspectorProps = Readonly<{
  binding: AnimationClipEventInspectorBinding;
}>;

export function AnimationClipEventInspector({ binding }: AnimationClipEventInspectorProps) {
  const { event } = binding;
  return <form
    className="rail-scroll animation-clip-event-inspector"
    role="region"
    aria-label="Selected animation event"
    autoComplete="off"
    onSubmit={(submitEvent) => submitEvent.preventDefault()}
  >
    <PanelHeader
      tone="animation"
      icon={<EditorIcon name="animation" size="control" />}
      title={<span className="animation-clip-event-inspector__title">
        <span>Animation Event</span>
        <small className="animation-clip-event-inspector__time">{event.timeSeconds.toFixed(2)} s</small>
      </span>}
      actions={<button
        type="button"
        className="icon-button compact danger"
        aria-label="Delete animation event"
        title="Delete animation event"
        onClick={binding.onDelete}
      ><EditorIcon name="delete" size="row-action" /></button>}
    />
    <InspectorGrid className="animation-clip-event-inspector__properties">
      <InspectorRow label="Event name"><input
        className="editor-input"
        key={`${event.id}:${event.name}`}
        defaultValue={event.name}
        aria-label="Animation event name"
        onBlur={(inputEvent) => {
          const name = inputEvent.currentTarget.value.trim();
          if (!name) inputEvent.currentTarget.value = event.name;
          else if (name !== event.name) binding.onRename(name);
        }}
      /></InspectorRow>
    </InspectorGrid>
  </form>;
}
