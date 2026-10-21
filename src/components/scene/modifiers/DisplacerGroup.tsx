import { useState, type ReactNode } from "react";
import { EditorIcon } from "../../../ui/EditorIcon";

type DisplacerGroupProps = {
  title: string;
  meta?: string;
  tone: "source" | "geometry" | "surface" | "camera";
  action?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
};

export function DisplacerGroup({
  title,
  meta,
  tone,
  action,
  defaultOpen = true,
  children,
}: DisplacerGroupProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`displacer-group displacer-group--${tone} ${open ? "is-open" : ""}`}>
      <div className="displacer-group__head">
        <button
          type="button"
          className="displacer-group__toggle"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <EditorIcon name={open ? "disclosureOpen" : "disclosureClosed"} size="compact" />
          <span>
            {title}
            {meta && <small>{meta}</small>}
          </span>
        </button>
        {action && <div className="displacer-group__action">{action}</div>}
      </div>
      {open && <div className="displacer-group__body">{children}</div>}
    </div>
  );
}
