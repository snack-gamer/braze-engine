import { useEffect, useState, type ReactNode } from "react";
import { EditorIcon } from "../../ui/EditorIcon";
import { EditorCheckbox } from "../../ui/controls/EditorCheckbox";

const STORAGE_PREFIX = "tgan.inspector.section.";

function storedOpen(id: string, defaultOpen: boolean): boolean {
  if (typeof window === "undefined") return defaultOpen;
  const stored = window.localStorage.getItem(`${STORAGE_PREFIX}${id}`);
  if (stored === "open") return true;
  if (stored === "closed") return false;
  return defaultOpen;
}

export function useInspectorSectionOpen(id: string, defaultOpen = false) {
  const [open, setOpen] = useState(() => storedOpen(id, defaultOpen));
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(`${STORAGE_PREFIX}${id}`, open ? "open" : "closed");
  }, [id, open]);
  return [open, setOpen] as const;
}

type InspectorSectionProps = {
  id: string;
  title: ReactNode;
  label?: string;
  icon?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  defaultOpen?: boolean;
  // "grid" packs the body's property rows two-up (InspectorGrid rules) instead
  // of one full-width row per parameter. Sub-titles, vector rows and groups
  // still span the whole width — see .inspector-grid in inspector.css.
  layout?: "list" | "grid";
  // Unity-style component enable checkbox in the header. Present only on
  // components that can be disabled (renderers, behaviours) — omit for
  // components like Transform / Mesh Filter that are always active.
  enable?: {
    checked: boolean;
    onChange: (checked: boolean) => void;
    ariaLabel?: string;
  };
  // Component options surfaced via right-click on the header (Unity-style).
  // Provide onRemove to make the component removable; onReset to reset it.
  onRemove?: () => void;
  onReset?: () => void;
};

export function InspectorSection({
  id,
  title,
  label,
  icon,
  meta,
  actions,
  children,
  className = "",
  defaultOpen = false,
  layout = "list",
  enable,
  onRemove,
  onReset,
}: InspectorSectionProps) {
  const [open, setOpen] = useInspectorSectionOpen(id, defaultOpen);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const titleLabel = label ?? (typeof title === "string" ? title : "section");
  const toggle = () => setOpen((value) => !value);
  const hasMenu = Boolean(onRemove || onReset);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("mousedown", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("blur", close);
    };
  }, [menu]);

  return (
    <section className={`rail-section inspector-section ${open ? "open" : "closed"} ${className}`}>
      <div
        className="inspector-section__head"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        title={open ? `Collapse ${titleLabel}` : `Expand ${titleLabel}`}
        onClick={toggle}
        onContextMenu={hasMenu ? (event) => {
          event.preventDefault();
          event.stopPropagation();
          setMenu({ x: event.clientX, y: event.clientY });
        } : undefined}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggle();
          }
        }}
      >
        <span className="inspector-section__toggle" aria-hidden="true">
          <EditorIcon name={open ? "disclosureOpen" : "disclosureClosed"} size="micro" />
        </span>
        <span className="inspector-section__title">
          {enable && (
            <EditorCheckbox
              className="inspector-section__enable"
              checked={enable.checked}
              aria-label={enable.ariaLabel ?? `Enable ${titleLabel}`}
              title={enable.checked ? `Disable ${titleLabel}` : `Enable ${titleLabel}`}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => enable.onChange(event.target.checked)}
            />
          )}
          {icon && <span className="inspector-section__title-icon" aria-hidden="true">{icon}</span>}
          <span>{title}</span>
        </span>
        {meta && <span className="rail-meta">{meta}</span>}
        {actions && (
          <div className="rail-actions" onClick={(event) => event.stopPropagation()}>
            {actions}
          </div>
        )}
      </div>
      {open && children && (
        <div className={`inspector-section__body ${layout === "grid" ? "inspector-grid" : ""}`.trim()}>
          {children}
        </div>
      )}
      {menu && (
        <div
          className="component-menu"
          role="menu"
          style={{ left: menu.x, top: menu.y }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {onReset && (
            <button
              type="button"
              className="component-menu__item"
              role="menuitem"
              onClick={() => { setMenu(null); onReset(); }}
            >
              <EditorIcon name="reset" size="control" /> Reset
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              className="component-menu__item component-menu__item--danger"
              role="menuitem"
              onClick={() => { setMenu(null); onRemove(); }}
            >
              <EditorIcon name="delete" size="control" /> Remove Component
            </button>
          )}
        </div>
      )}
    </section>
  );
}
