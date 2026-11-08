import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { EditorIcon } from "../../ui/EditorIcon";
import { InspectorSectionMenu } from "./InspectorSectionMenu";
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
  // "grid" uses the shared single-column property stack. Vector rows reflow
  // with the Inspector pane width; functional groups remain explicit.
  layout?: "list" | "grid";
  // Unity-style component enable checkbox in the header. Present only on
  // components that can be disabled (renderers, behaviours) — omit for
  // components like Transform / Mesh Filter that are always active.
  enable?: {
    checked: boolean;
    onChange: (checked: boolean) => void;
    ariaLabel?: string;
  };
  // Component options share a visible menu and header context menu.
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
  const [menu, setMenu] = useState<{ x: number; y: number; returnFocus: HTMLElement } | null>(null);
  const disclosure = useRef<HTMLButtonElement>(null);
  const titleLabel = label ?? (typeof title === "string" ? title : "section");
  const toggle = () => setOpen((value) => !value);
  const hasMenu = Boolean(onRemove || onReset);

  const closeMenu = useCallback((restoreFocus: boolean) => {
    if (restoreFocus) menu?.returnFocus.focus();
    setMenu(null);
  }, [menu]);

  return (
    <section className={`rail-section inspector-section ${open ? "open" : "closed"} ${className}`}>
      <div
        className="inspector-section__head"
        title={open ? `Collapse ${titleLabel}` : `Expand ${titleLabel}`}
        onClick={toggle}
        onContextMenu={hasMenu ? (event) => {
          event.preventDefault();
          event.stopPropagation();
          setMenu({ x: event.clientX, y: event.clientY, returnFocus: disclosure.current! });
        } : undefined}
      >
        <button type="button" ref={disclosure} className="inspector-section__toggle"
          aria-label={titleLabel} aria-expanded={open}
          onClick={(event) => { event.stopPropagation(); toggle(); }}
          onKeyDown={(event) => {
            if (hasMenu && (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10"))) {
              event.preventDefault();
              const rect = event.currentTarget.getBoundingClientRect();
              setMenu({ x: rect.left, y: rect.bottom, returnFocus: event.currentTarget });
            }
          }}>
          <EditorIcon name={open ? "disclosureOpen" : "disclosureClosed"} size="micro" />
        </button>
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
        {(meta || actions || hasMenu) && (
          <div className="rail-actions" onClick={(event) => event.stopPropagation()}>
            {meta && <span className="rail-meta">{meta}</span>}
            {actions}
            {hasMenu && <button type="button" className="icon-button inspector-section__menu-button"
              aria-label={`${titleLabel} options`} aria-haspopup="menu" aria-expanded={Boolean(menu)}
              title={`${titleLabel} options`} onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                setMenu(menu ? null : { x: rect.left, y: rect.bottom, returnFocus: event.currentTarget });
              }}><EditorIcon name="more" size="compact" /></button>}
          </div>
        )}
      </div>
      {open && children && (
        <div className={`inspector-section__body ${layout === "grid" ? "inspector-grid" : ""}`.trim()}>
          {children}
        </div>
      )}
      {menu && <InspectorSectionMenu position={menu} label={titleLabel} trigger={menu.returnFocus}
        onReset={onReset} onRemove={onRemove} onClose={closeMenu} />}
    </section>
  );
}
