import { useBehaviorCatalog } from "../hooks/useBehaviorCatalog";
import { BehaviorEditor, type BehaviorEditorProps } from "./BehaviorEditor";

export function ProjectBehaviorInspector(props: BehaviorEditorProps) {
  const { snapshot, reload } = useBehaviorCatalog();
  return <BehaviorEditor {...props} catalog={snapshot} reload={() => { void reload(); }} />;
}
