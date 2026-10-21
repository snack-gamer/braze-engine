using System;
using System.Collections.Generic;
using System.Linq;

namespace Braze.Bridge.Editor
{
    public enum BrazeDiagnosticSeverity
    {
        Info,
        Warning,
        Error,
    }

    [Serializable]
    public sealed class BrazeExportDiagnostic
    {
        public string code;
        public string severity;
        public string message;
        public string unityPath;

        internal BrazeExportDiagnostic(
            string code,
            BrazeDiagnosticSeverity severity,
            string message,
            string unityPath = "")
        {
            this.code = code;
            this.severity = severity.ToString().ToLowerInvariant();
            this.message = message;
            this.unityPath = unityPath ?? "";
        }

        public override string ToString()
        {
            var location = string.IsNullOrEmpty(unityPath) ? "" : $" [{unityPath}]";
            return $"{severity.ToUpperInvariant()} {code}{location}: {message}";
        }
    }

    internal sealed class BrazeDiagnosticBag
    {
        private readonly List<BrazeExportDiagnostic> items = new List<BrazeExportDiagnostic>();

        public IReadOnlyList<BrazeExportDiagnostic> Items => items;
        public bool HasErrors => items.Any(item => item.severity == "error");
        public bool HasWarnings => items.Any(item => item.severity == "warning");

        public void Info(string code, string message, string unityPath = "")
        {
            Add(code, BrazeDiagnosticSeverity.Info, message, unityPath);
        }

        public void Warning(string code, string message, string unityPath = "")
        {
            Add(code, BrazeDiagnosticSeverity.Warning, message, unityPath);
        }

        public void Error(string code, string message, string unityPath = "")
        {
            Add(code, BrazeDiagnosticSeverity.Error, message, unityPath);
        }

        private void Add(
            string code,
            BrazeDiagnosticSeverity severity,
            string message,
            string unityPath)
        {
            items.Add(new BrazeExportDiagnostic(code, severity, message, unityPath));
        }
    }

    public sealed class BrazeExportException : Exception
    {
        public IReadOnlyList<BrazeExportDiagnostic> Diagnostics { get; }

        internal BrazeExportException(
            string message,
            IReadOnlyList<BrazeExportDiagnostic> diagnostics)
            : base(BuildMessage(message, diagnostics))
        {
            Diagnostics = diagnostics?.ToArray() ?? Array.Empty<BrazeExportDiagnostic>();
        }

        private static string BuildMessage(
            string message,
            IReadOnlyList<BrazeExportDiagnostic> diagnostics)
        {
            if (diagnostics == null || diagnostics.Count == 0)
            {
                return message;
            }

            return message + Environment.NewLine + string.Join(
                Environment.NewLine,
                diagnostics.Select(item => "  " + item));
        }
    }
}
