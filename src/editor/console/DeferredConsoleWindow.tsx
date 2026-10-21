import { lazy, Suspense } from "react";

const LazyConsoleWindow = lazy(async () => {
  const module = await import("./ConsoleWindow");
  return { default: module.ConsoleWindow };
});

/** Loads Console presentation only when its dock pane opens; capture remains eager. */
export function DeferredConsoleWindow({ load }: Readonly<{ load: boolean }>) {
  if (!load) return null;
  return (
    <Suspense fallback={<div className="console-window__loading">Loading Console…</div>}>
      <LazyConsoleWindow />
    </Suspense>
  );
}
