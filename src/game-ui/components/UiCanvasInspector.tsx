import { lazy, Suspense } from "react";
import type { UiCanvasEditorProps } from "./UiCanvasEditor";
const Editor = lazy(async () => ({ default: (await import("./UiCanvasEditor")).UiCanvasEditor }));
export function UiCanvasInspector(props: UiCanvasEditorProps) {
  return <Suspense fallback={<div role="status">Loading UI Canvas…</div>}><Editor key={props.object.id} {...props} /></Suspense>;
}
