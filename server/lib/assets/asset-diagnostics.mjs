export function assetDiagnostic(code, severity, message, details = {}) {
  return { code, severity, message, ...details };
}

export function assetStatusForDiagnostics(diagnostics) {
  if (diagnostics.some((item) => item.severity === "error")) return "failed";
  if (diagnostics.some((item) => item.severity === "warning")) return "dirty";
  return "ready";
}
