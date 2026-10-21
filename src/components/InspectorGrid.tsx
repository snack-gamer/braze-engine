import type { ReactNode } from "react";

type InspectorGridProps = {
  children: ReactNode;
  className?: string;
};

/**
 * The canonical ordered Inspector property stack. It stays single-column at
 * every pane width so labels and controls never trade clarity for density.
 * Use InspectorGroup for functional hierarchy instead of implicit columns.
 */
export function InspectorGrid({ children, className = "" }: InspectorGridProps) {
  return <div className={`inspector-grid ${className}`.trim()}>{children}</div>;
}
