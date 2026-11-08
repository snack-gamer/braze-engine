import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { EditorIcon } from "../ui/EditorIcon";

/** A compact property trigger with an anchored menu outside Inspector flow. */
export function InspectorMenuSelect({ label, value, children }: { label: string; value: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const anchorBounds = useRef<DOMRect | null>(null);
  const id = useId();
  const [bounds, setBounds] = useState({ left: 0, top: 0, maxHeight: 0 });
  const show = () => {
    // Measure at a safe origin, never at stale coordinates from a wider pane.
    setBounds({ left: 0, top: 0, maxHeight: 0 });
    setOpen(true);
  };
  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  }, []);
  useLayoutEffect(() => {
    if (!open || !menu.current || !trigger.current) return;
    const popup = menu.current, anchor = trigger.current.getBoundingClientRect();
    anchorBounds.current = anchor;
    const style = getComputedStyle(popup);
    const inset = parseFloat(style.getPropertyValue("--inspector-popup-inset"));
    const gap = parseFloat(style.getPropertyValue("--inspector-popup-gap"));
    const limit = parseFloat(style.getPropertyValue("--inspector-popup-max-h"));
    const below = window.innerHeight - anchor.bottom - gap - inset, above = anchor.top - gap - inset;
    const up = below < Math.min(popup.scrollHeight, limit) && above > below;
    const maxHeight = Math.max(0, Math.min(limit, up ? above : below));
    const height = Math.min(popup.scrollHeight + 2, maxHeight);
    setBounds({ left: Math.max(inset, Math.min(anchor.left, window.innerWidth - popup.offsetWidth - inset)),
      top: up ? anchor.top - gap - height : anchor.bottom + gap, maxHeight });
    popup.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => {
      if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) close(false);
    };
    const dismiss = () => close(false);
    const scroll = (event: Event) => {
      if (menu.current?.contains(event.target as Node)) return;
      const current = trigger.current?.getBoundingClientRect(), anchor = anchorBounds.current;
      // A click may queue a scroll-into-view event before the menu mounts.
      // Dismiss only if scrolling actually moves its measured anchor.
      if (!current || !anchor || Math.abs(current.top - anchor.top) > .5 || Math.abs(current.left - anchor.left) > .5) close(false);
    };
    window.addEventListener("pointerdown", outside);
    window.addEventListener("focusin", outside);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", dismiss);
    window.addEventListener("blur", dismiss);
    return () => {
      window.removeEventListener("pointerdown", outside);
      window.removeEventListener("focusin", outside);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("blur", dismiss);
    };
  }, [open, close]);
  return <>
    <button ref={trigger} type="button" className="editor-select inspector-menu-select" aria-label={label}
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} title={value}
      onClick={() => open ? close(false) : show()} onKeyDown={(event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); event.stopPropagation(); show(); }
      }}>
      <span>{value}</span><EditorIcon name="disclosureOpen" size="disclosure" />
    </button>
    {open && createPortal(<div ref={menu} id={id} className="inspector-select-menu" role="menu" aria-label={label}
      style={{ ...bounds, maxHeight: bounds.maxHeight || undefined }} onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); return; }
        if (event.key === "Tab") { close(true); return; }
        if (event.key === "Enter" || event.key === " ") event.stopPropagation();
        const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "ArrowDown" ? (index + 1) % items.length
          : event.key === "ArrowUp" ? (index - 1 + items.length) % items.length
            : event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : -1;
        if (next >= 0) { event.preventDefault(); event.stopPropagation(); items[next]?.focus(); }
      }}>{children}</div>, document.body)}
  </>;
}
