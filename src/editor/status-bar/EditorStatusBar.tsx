import { EditorIcon } from "../../ui/EditorIcon";
import { useEditorStatusSnapshot } from "./EditorStatusProvider";
import type { EditorStatusEntry, EditorStatusTone } from "./editor-status-store";
import "./editor-status-bar.css";

function activityIcon(tone: EditorStatusTone | undefined, busy: boolean | undefined) {
  if (busy) return "refresh" as const;
  if (tone === "danger" || tone === "warning") return "warning" as const;
  if (tone === "success") return "check" as const;
  return "statistics" as const;
}

function Metric({ entry }: { entry: EditorStatusEntry }) {
  return (
    <span className={`editor-status-bar__metric is-${entry.tone ?? "neutral"}`} title={`${entry.detail ?? "Status"}: ${entry.label}`}>
      {entry.detail && <small>{entry.detail}</small>}
      <strong>{entry.label}</strong>
    </span>
  );
}

/** Persistent shell footer for contextual, activity, and runtime status. */
export function EditorStatusBar() {
  const entries = useEditorStatusSnapshot();
  const context = entries.find((entry) => entry.slot === "context");
  const activity = entries.find((entry) => entry.slot === "activity");
  const metrics = entries.filter((entry) => entry.slot === "metric").slice(0, 4);
  const activityTone = activity?.tone ?? "neutral";

  return (
    <footer className="editor-status-bar" role="contentinfo" aria-label="Editor status">
      <div className="editor-status-bar__context" title={context ? `${context.label} — ${context.detail ?? "Selection"}` : "No selection"}>
        <EditorIcon name="focus" size="compact" />
        <strong>{context?.label ?? "No selection"}</strong>
        <span>{context?.detail ?? "Scene"}</span>
      </div>

      <div
        className={`editor-status-bar__activity is-${activityTone} ${activity?.busy ? "is-busy" : ""}`}
        role="status"
        aria-live="polite"
        aria-busy={activity?.busy ?? false}
        title={activity?.detail ? `${activity.label} — ${activity.detail}` : activity?.label ?? "Ready"}
      >
        <EditorIcon name={activityIcon(activityTone, activity?.busy)} size="compact" />
        <strong>{activity?.label ?? "Ready"}</strong>
        {activity?.detail && <span>{activity.detail}</span>}
        {activity?.action && (
          <button
            type="button"
            className="editor-status-bar__action"
            aria-label={activity.action.ariaLabel}
            onClick={activity.action.run}
          >
            {activity.action.label}
          </button>
        )}
      </div>

      <div className="editor-status-bar__metrics" aria-label="Editor metrics">
        {metrics.map((entry) => <Metric key={entry.id} entry={entry} />)}
      </div>
    </footer>
  );
}
