import { memo } from "react";
import { EditorIcon } from "../../ui/EditorIcon";
import type { CharacterDiagnostic } from "../domain/diagnostics";

/** Presents deduplicated rig diagnostics without coupling them to preview playback state. */
export const AvatarDiagnosticSummary = memo(function AvatarDiagnosticSummary({
  diagnostics,
}: Readonly<{ diagnostics: readonly CharacterDiagnostic[] }>) {
  const visible = diagnostics.filter((diagnostic, index, entries) => (
    entries.findIndex((candidate) => candidate.code === diagnostic.code && candidate.message === diagnostic.message) === index
  ));
  const errorCount = visible.filter((diagnostic) => diagnostic.severity === "error").length;
  const warningCount = visible.filter((diagnostic) => diagnostic.severity === "warning").length;
  const status = errorCount > 0
    ? `${errorCount} ${errorCount === 1 ? "issue" : "issues"}`
    : warningCount > 0
      ? `Ready · ${warningCount} ${warningCount === 1 ? "note" : "notes"}`
      : "Ready";
  return (
    <section className="avatar-configurator__card avatar-configurator__diagnostics">
      <header><strong>Avatar Check</strong><span>{status}</span></header>
      {visible.length === 0 && <p>No setup problems found.</p>}
      {visible.slice(0, 8).map((diagnostic) => (
        <div key={`${diagnostic.code}:${diagnostic.message}`} data-severity={diagnostic.severity}>
          <EditorIcon name={diagnostic.severity === "error" ? "error" : diagnostic.severity === "warning" ? "warning" : "check"} size="compact" />
          <span>{readableDiagnosticMessage(diagnostic)}</span>
        </div>
      ))}
      {visible.length > 8 && <small>{visible.length - 8} more checks are available in the import log.</small>}
    </section>
  );
});

function readableDiagnosticMessage(diagnostic: CharacterDiagnostic): string {
  if (diagnostic.code === "duplicate-bone-names") {
    return "Repeated bone names were found in imported skin sections. Braze uses each bone's full hierarchy path, so these assignments remain unambiguous.";
  }
  return diagnostic.message;
}
