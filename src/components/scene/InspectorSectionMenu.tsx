import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { EditorIcon } from "../../ui/EditorIcon";
import { createPortal } from "react-dom";

type Props = {
  position: { x: number; y: number };
  label: string;
  trigger: HTMLElement;
  onReset?: () => void;
  onRemove?: () => void;
  onClose: (restoreFocus: boolean) => void;
};

/** Shared component actions, reachable by pointer and keyboard. */
export function InspectorSectionMenu({ position, label, trigger, onReset, onRemove, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState(position);
  useLayoutEffect(() => {
    const menu = ref.current!;
    const rect = menu.getBoundingClientRect();
    setBounds({ x: Math.max(0, Math.min(position.x, window.innerWidth - rect.width)),
      y: Math.max(0, Math.min(position.y, window.innerHeight - rect.height)) });
    menu.querySelector<HTMLButtonElement>("button")?.focus();
  }, [position]);
  useEffect(() => {
    const outside = (event: Event) => {
      if (!ref.current?.contains(event.target as Node) && !trigger.contains(event.target as Node)) onClose(false);
    };
    const blur = () => onClose(false);
    window.addEventListener("pointerdown", outside);
    window.addEventListener("focusin", outside);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("pointerdown", outside);
      window.removeEventListener("focusin", outside);
      window.removeEventListener("blur", blur);
    };
  }, [onClose, trigger]);
  return createPortal(<div ref={ref} className="component-menu" role="menu" aria-label={`${label} options`}
    style={{ left: bounds.x, top: bounds.y }} onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(true); return; }
      const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === "ArrowDown" ? (index + 1) % buttons.length
        : event.key === "ArrowUp" ? (index - 1 + buttons.length) % buttons.length
          : event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : -1;
      if (next >= 0) { event.preventDefault(); buttons[next]?.focus(); }
    }}>
    {onReset && <button type="button" className="component-menu__item" role="menuitem"
      onClick={() => { onClose(true); onReset(); }}>
      <EditorIcon name="reset" size="control" /> Reset
    </button>}
    {onRemove && <button type="button" className="component-menu__item component-menu__item--danger" role="menuitem"
      onClick={() => { onClose(true); onRemove(); }}>
      <EditorIcon name="delete" size="control" /> Remove Component
    </button>}
  </div>, document.body);
}
