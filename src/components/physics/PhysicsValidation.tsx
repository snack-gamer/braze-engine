import type { PhysicsCompileDiagnostic } from "../../physics/runtime/contracts";
import { EditorIcon } from "../../ui/EditorIcon";

export function PhysicsValidation({ diagnostics }: { diagnostics: PhysicsCompileDiagnostic[] }) {
  if (diagnostics.length === 0) return null;
  return (
    <div className="physics-validation" role="status" aria-label="Physics validation">
      {diagnostics.map((diagnostic) => (
        <div key={`${diagnostic.code}:${diagnostic.objectId}`} className={`physics-validation__item ${diagnostic.severity}`}>
          <EditorIcon name={diagnostic.severity === "error" ? "error" : "warning"} size="control" />
          <span>{diagnostic.message}</span>
        </div>
      ))}
    </div>
  );
}
