export type CharacterDiagnosticSeverity = "info" | "warning" | "error";

/** Structured importer/avatar feedback. Platform adapters may add stable codes. */
export type CharacterDiagnostic = {
  code: string;
  severity: CharacterDiagnosticSeverity;
  message: string;
  path?: string;
  boneId?: string;
  humanBone?: string;
};

export type CharacterValidationMetadata = {
  status: "valid" | "warning" | "invalid";
  issues: CharacterDiagnostic[];
};
