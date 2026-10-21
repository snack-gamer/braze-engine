import { lazy, Suspense } from "react";
import type { AnimatorDockPaneProps } from "./AnimatorDockPane";

const AnimatorDockPane = lazy(async () => {
  const module = await import("./AnimatorDockPane");
  return { default: module.AnimatorDockPane };
});

/** Keeps the feature-heavy Behavior Map out of the editor's startup bundle. */
export function LazyAnimatorDockPane(props: AnimatorDockPaneProps) {
  return <Suspense fallback={<div role="status">Loading Behavior Map…</div>}>
    <AnimatorDockPane {...props} />
  </Suspense>;
}
