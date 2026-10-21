import type { CharacterRuntimeDiagnostic } from "../../runtime/diagnostics";

const MAX_RETAINED_DIAGNOSTICS = 256;

type ThreeAnimatorDiagnosticListener = (
  diagnostics: readonly CharacterRuntimeDiagnostic[],
) => void;

/** Owns bounded diagnostic deduplication and isolated observer delivery. */
export class ThreeAnimatorDiagnosticLog {
  private readonly retained: CharacterRuntimeDiagnostic[] = [];
  private readonly keys = new Set<string>();

  constructor(private readonly listener?: ThreeAnimatorDiagnosticListener) {}

  snapshot(): readonly CharacterRuntimeDiagnostic[] {
    return [...this.retained];
  }

  record(diagnostics: readonly CharacterRuntimeDiagnostic[], objectId?: string): void {
    const added: CharacterRuntimeDiagnostic[] = [];
    for (const diagnostic of diagnostics) {
      if (this.retained.length >= MAX_RETAINED_DIAGNOSTICS) break;
      const withPath = objectId && !diagnostic.path ? { ...diagnostic, path: objectId } : diagnostic;
      const key = diagnosticKey(withPath);
      if (this.keys.has(key)) continue;
      this.keys.add(key);
      this.retained.push(withPath);
      added.push(withPath);
    }
    if (added.length === 0 || !this.listener) return;
    try {
      this.listener(added);
    } catch (error) {
      this.retainListenerFailure(error);
    }
  }

  private retainListenerFailure(error: unknown): void {
    const failure: CharacterRuntimeDiagnostic = {
      code: "animator-diagnostics-listener-failed",
      severity: "warning",
      message: `Animator diagnostics listener failed: ${error instanceof Error ? error.message : String(error)}`,
    };
    const key = diagnosticKey(failure);
    if (this.retained.length >= MAX_RETAINED_DIAGNOSTICS || this.keys.has(key)) return;
    this.keys.add(key);
    this.retained.push(failure);
  }
}

function diagnosticKey(diagnostic: CharacterRuntimeDiagnostic): string {
  return `${diagnostic.code}\u0000${diagnostic.path ?? ""}\u0000${diagnostic.message}`;
}
