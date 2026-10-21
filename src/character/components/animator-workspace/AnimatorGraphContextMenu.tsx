import {
  useLayoutEffect,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import type { AnimatorGraphPoint } from "./animator-graph-viewport";

export type AnimatorGraphContextMenuAction = Readonly<{
  id: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  disabledReason?: string;
}>;

type AnimatorGraphContextMenuProps = Readonly<{
  ariaLabel: string;
  screenPosition: AnimatorGraphPoint;
  actions: readonly AnimatorGraphContextMenuAction[];
  menuRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
}>;

type MenuPosition = Readonly<{
  left: number;
  top: number;
  visibility: "hidden" | "visible";
}>;

const MENU_VIEWPORT_MARGIN = 6;

/** Renders graph actions in a viewport-clamped, keyboard-navigable menu. */
export function AnimatorGraphContextMenu({
  ariaLabel,
  screenPosition,
  actions,
  menuRef,
  onClose,
}: AnimatorGraphContextMenuProps) {
  const [position, setPosition] = useState<MenuPosition>({
    left: -9999,
    top: -9999,
    visibility: "hidden",
  });

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    setPosition({
      left: clampMenuAxis(screenPosition.x, menu.offsetWidth, window.innerWidth),
      top: clampMenuAxis(screenPosition.y, menu.offsetHeight, window.innerHeight),
      visibility: "visible",
    });
    menu.querySelector<HTMLButtonElement>('[role="menuitem"]')
      ?.focus({ preventScroll: true });
  }, [actions.length, menuRef, screenPosition.x, screenPosition.y]);

  const content = (
    <div
      ref={menuRef}
      className="animator-graph-context-menu"
      role="menu"
      aria-label={ariaLabel}
      style={position}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={moveMenuFocus}
    >
      {actions.map((action) => <button
        type="button"
        role="menuitem"
        tabIndex={-1}
        key={action.id}
        className="animator-graph-context-menu__item"
        aria-disabled={action.disabled || undefined}
        aria-description={action.disabled ? action.disabledReason : undefined}
        onClick={() => {
          if (action.disabled) return;
          try {
            action.onSelect();
          } finally {
            onClose();
          }
        }}
      >
        <span>{action.label}</span>
      </button>)}
    </div>
  );
  return typeof document === "undefined" ? content : createPortal(content, document.body);
}

function clampMenuAxis(requested: number, menuSize: number, viewportSize: number): number {
  return Math.max(
    MENU_VIEWPORT_MARGIN,
    Math.min(requested, viewportSize - menuSize - MENU_VIEWPORT_MARGIN),
  );
}

function moveMenuFocus(event: ReactKeyboardEvent<HTMLDivElement>): void {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>(
    '[role="menuitem"]',
  ));
  if (items.length === 0) return;
  event.preventDefault();
  const current = items.indexOf(document.activeElement as HTMLButtonElement);
  if (event.key === "Home") items[0]!.focus();
  else if (event.key === "End") items[items.length - 1]!.focus();
  else {
    const direction = event.key === "ArrowDown" ? 1 : -1;
    const next = current < 0
      ? direction > 0 ? 0 : items.length - 1
      : (current + direction + items.length) % items.length;
    items[next]!.focus();
  }
}
