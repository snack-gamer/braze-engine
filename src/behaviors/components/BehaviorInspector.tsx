import { lazy, Suspense } from "react";
import type { BehaviorEditorProps } from "./BehaviorEditor";

const LazyBehaviorInspector = lazy(async () => {
  const { ProjectBehaviorInspector } = await import("./ProjectBehaviorInspector");
  return { default: ProjectBehaviorInspector };
});

export function BehaviorInspector(props: BehaviorEditorProps) {
  if (!props.object.behaviors) return null;
  return <Suspense fallback={<div className="component-card" role="status">Loading Behaviors…</div>}>
    <LazyBehaviorInspector key={props.object.id} {...props} />
  </Suspense>;
}
