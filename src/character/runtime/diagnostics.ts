export type CharacterRuntimeDiagnosticSeverity = "info" | "warning" | "error";

export type CharacterRuntimeDiagnostic = Readonly<{
  code: string;
  severity: CharacterRuntimeDiagnosticSeverity;
  message: string;
  path?: string;
  details?: Readonly<Record<string, string | number | boolean>>;
}>;

export type CharacterRuntimeResult<T> = Readonly<{
  value: T | null;
  diagnostics: readonly CharacterRuntimeDiagnostic[];
}>;

export function characterRuntimeSuccess<T>(
  value: T,
  diagnostics: readonly CharacterRuntimeDiagnostic[] = [],
): CharacterRuntimeResult<T> {
  return { value, diagnostics };
}

export function characterRuntimeFailure<T = never>(
  diagnostic: CharacterRuntimeDiagnostic | readonly CharacterRuntimeDiagnostic[],
): CharacterRuntimeResult<T>;
export function characterRuntimeFailure<T = never>(
  code: string,
  message: string,
): CharacterRuntimeResult<T>;
export function characterRuntimeFailure<T = never>(
  diagnostic: CharacterRuntimeDiagnostic | readonly CharacterRuntimeDiagnostic[] | string,
  message?: string,
): CharacterRuntimeResult<T> {
  if (typeof diagnostic === "string") {
    return { value: null, diagnostics: [{ code: diagnostic, severity: "error", message: message! }] };
  }
  return { value: null, diagnostics: Array.isArray(diagnostic) ? diagnostic : [diagnostic] };
}

export function hasCharacterRuntimeErrors(
  diagnostics: readonly CharacterRuntimeDiagnostic[],
): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === "error");
}
