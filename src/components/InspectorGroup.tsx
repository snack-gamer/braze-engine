import type { ReactNode } from "react";
import { EditorIcon } from "../ui/EditorIcon";
import { useInspectorSectionOpen } from "./scene/InspectorSection";

type InspectorGroupProps = {
  // Stable id → collapse state persists per group type across selections.
  id: string;
  title: string;
  meta?: ReactNode;
  // Trailing hint explaining the group's parameters.
  note?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
};

/**
 * A collapsible, labelled subsection inside an InspectorSection body: a quiet
 * divider (chevron, label, hairline rule), not a nested card. The section header
 * is the only bar in a component; each group names one concern (Randomization,
 * Field, Radial …). Use groups when a component has enough properties to need
 * them; a component with a handful of rows should list them directly.
 */
export function InspectorGroup({ id, title, meta, note, defaultOpen = true, children }: InspectorGroupProps) {
  const [open, setOpen] = useInspectorSectionOpen(`group.${id}`, defaultOpen);
  return (
    <div className={`inspector-group ${open ? "open" : "closed"}`}>
      <button
        type="button"
        className="inspector-group__head"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <EditorIcon
          name="disclosureClosed"
          size="compact"
          className="inspector-group__chevron"
        />
        <span className="inspector-group__title">{title}</span>
        {meta !== undefined && <span className="inspector-group__meta">{meta}</span>}
      </button>
      {open && (
        <div className="inspector-group__body">
          {children}
          {note !== undefined && <p className="inspector-group__note">{note}</p>}
        </div>
      )}
    </div>
  );
}
