import type { ReactNode } from "react";

type BottomPanelWindowProps = {
  label: string;
  className?: string;
  children: ReactNode;
};

/**
 * Shared content shell for timeline-style dock panes. Dock sizing, movement,
 * and persistence belong exclusively to EditorDockWorkspace; keeping legacy
 * resize state here caused hidden listeners and two competing layout owners.
 */
export function BottomPanelWindow({ label, className = "", children }: BottomPanelWindowProps) {
  return (
    <div
      className={["animation-panel", className].filter(Boolean).join(" ")}
      aria-label={label}
    >
      {children}
    </div>
  );
}
