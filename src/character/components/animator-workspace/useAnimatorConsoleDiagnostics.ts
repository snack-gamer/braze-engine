import { useEffect, useRef } from "react";
import { useEditorConsoleCommands } from "../../../editor/console/EditorConsoleProvider";
import type { EditorConsoleEntryInput } from "../../../editor/console/console-types";
import type { AnimatorController } from "../../domain/animator-controller";
import { findAnimatorState } from "../../domain/animator-state-machine";
import type { CharacterRuntimeDiagnostic } from "../../runtime/diagnostics";

type ActiveDiagnostics = { controllerId: string; keys: ReadonlySet<string> };

/** Publishes newly active controller diagnostics into the shared editor Console. */
export function useAnimatorConsoleDiagnostics(
  controller: AnimatorController,
  diagnostics: readonly CharacterRuntimeDiagnostic[],
): void {
  const { publish } = useEditorConsoleCommands();
  const activeRef = useRef<ActiveDiagnostics>({ controllerId: "", keys: new Set() });
  useEffect(() => {
    const previous = activeRef.current.controllerId === controller.id
      ? activeRef.current.keys
      : new Set<string>();
    const entries = diagnostics.map((diagnostic) => animatorConsoleDiagnosticEntry(controller, diagnostic));
    const keys = new Set(entries.map(animatorConsoleDiagnosticKey));
    entries.forEach((entry) => {
      if (!previous.has(animatorConsoleDiagnosticKey(entry))) publish(entry);
    });
    activeRef.current = { controllerId: controller.id, keys };
  }, [controller, diagnostics, publish]);
}

export function animatorConsoleDiagnosticEntry(
  controller: AnimatorController,
  diagnostic: CharacterRuntimeDiagnostic,
): EditorConsoleEntryInput {
  const layerId = diagnostic.details?.layerId;
  const stateId = diagnostic.details?.stateId;
  const layer = typeof layerId === "string"
    ? controller.layers.find((candidate) => candidate.id === layerId)
    : undefined;
  const state = layer && typeof stateId === "string"
    ? findAnimatorState(layer, stateId)?.state
    : undefined;
  const message = diagnostic.code === "empty-blend-tree" && state
    ? `Blend Tree “${state.name}” has no child motions. Add at least one Animation Clip.`
    : diagnostic.message;
  return {
    level: diagnostic.severity === "info" ? "log" : diagnostic.severity,
    method: "diagnostic",
    message,
    details: diagnostic.details ? JSON.stringify(diagnostic.details, null, 2) : undefined,
    source: [controller.name, layer?.name, state?.name].filter(Boolean).join(" / "),
    channel: "Animator",
    code: diagnostic.code,
  };
}

function animatorConsoleDiagnosticKey(entry: EditorConsoleEntryInput): string {
  return `${entry.level}\u0000${entry.code ?? ""}\u0000${entry.source ?? ""}\u0000${entry.message}`;
}
