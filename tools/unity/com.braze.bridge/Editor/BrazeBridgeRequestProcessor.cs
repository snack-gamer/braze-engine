using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;

namespace Braze.Bridge.Editor
{
    [InitializeOnLoad]
    internal static class BrazeBridgeRequestProcessor
    {
        private const double PollIntervalSeconds = 1.0;
        private static readonly string ProjectRoot =
            Directory.GetParent(Application.dataPath)?.FullName ?? Directory.GetCurrentDirectory();
        private static readonly string RequestDirectory =
            Path.Combine(ProjectRoot, "Library", "BrazeBridge");
        private static readonly string RequestPath =
            Path.Combine(RequestDirectory, "export-request.json");
        private static readonly string ResultPath =
            Path.Combine(RequestDirectory, "export-result.json");

        private static bool processing;
        private static double nextPoll;

        static BrazeBridgeRequestProcessor()
        {
            EditorApplication.update -= Poll;
            EditorApplication.update += Poll;
            EditorApplication.delayCall += Poll;
        }

        private static void Poll()
        {
            if (processing ||
                EditorApplication.isCompiling ||
                EditorApplication.isUpdating ||
                EditorApplication.isPlayingOrWillChangePlaymode ||
                EditorApplication.timeSinceStartup < nextPoll)
            {
                return;
            }

            nextPoll = EditorApplication.timeSinceStartup + PollIntervalSeconds;
            if (!File.Exists(RequestPath))
            {
                return;
            }

            Directory.CreateDirectory(RequestDirectory);
            var claimedPath = Path.Combine(
                RequestDirectory,
                "export-request.processing-" + Guid.NewGuid().ToString("N") + ".json");
            try
            {
                // Moving within Library is the exactly-once claim. An external
                // caller should likewise publish the request with temp+rename.
                File.Move(RequestPath, claimedPath);
            }
            catch (IOException)
            {
                return;
            }

            processing = true;
            try
            {
                ProcessClaimedRequest(claimedPath);
            }
            finally
            {
                processing = false;
                if (File.Exists(claimedPath))
                {
                    File.Delete(claimedPath);
                }
            }
        }

        private static void ProcessClaimedRequest(string claimedPath)
        {
            BrazeBridgeExportRequest request = null;
            try
            {
                request = JsonUtility.FromJson<BrazeBridgeExportRequest>(
                    File.ReadAllText(claimedPath));
                if (request == null ||
                    string.IsNullOrWhiteSpace(request.prefabPath) ||
                    string.IsNullOrWhiteSpace(request.outputPath))
                {
                    throw new InvalidDataException(
                        "Request must contain non-empty prefabPath and outputPath fields.");
                }

                var outputPath = ResolveProjectPath(request.outputPath);
                var manifestPath = string.IsNullOrWhiteSpace(request.manifestPath)
                    ? null
                    : ResolveProjectPath(request.manifestPath);
                var result = BrazeStaticPrefabExporter.Export(new BrazeStaticPrefabExportOptions
                {
                    PrefabAssetPath = request.prefabPath,
                    GlbOutputPath = outputPath,
                    ManifestOutputPath = manifestPath,
                    // A request is an explicit re-export instruction. Reusing
                    // the stable destination is therefore the useful default.
                    OverwriteExisting = true,
                    FailOnWarnings = request.failOnWarning,
                });

                foreach (var diagnostic in result.Diagnostics)
                {
                    BrazeBridgeMenu.LogDiagnostic(diagnostic);
                }
                WriteResult(new Dictionary<string, object>
                {
                    ["schemaVersion"] = 1,
                    ["requestId"] = request.requestId ?? "",
                    ["success"] = true,
                    ["prefabPath"] = request.prefabPath,
                    ["outputPath"] = result.GlbOutputPath,
                    ["manifestPath"] = result.ManifestOutputPath,
                    ["unityGuid"] = result.SourceUnityGuid,
                    ["sha256"] = result.GlbSha256,
                    ["diagnostics"] = DiagnosticDocuments(result.Diagnostics),
                });
                Debug.Log(
                    $"Braze Bridge processed export request '{request.requestId}' for '{request.prefabPath}'.");
            }
            catch (Exception exception)
            {
                var exportException = exception as BrazeExportException;
                var diagnostics = exportException?.Diagnostics ?? Array.Empty<BrazeExportDiagnostic>();
                foreach (var diagnostic in diagnostics)
                {
                    BrazeBridgeMenu.LogDiagnostic(diagnostic);
                }
                Debug.LogException(exception);
                WriteResult(new Dictionary<string, object>
                {
                    ["schemaVersion"] = 1,
                    ["requestId"] = request?.requestId ?? "",
                    ["success"] = false,
                    ["prefabPath"] = request?.prefabPath ?? "",
                    ["outputPath"] = request?.outputPath ?? "",
                    ["error"] = new Dictionary<string, object>
                    {
                        ["type"] = exception.GetType().FullName,
                        ["message"] = exception.Message,
                    },
                    ["diagnostics"] = DiagnosticDocuments(diagnostics),
                });
            }
        }

        private static string ResolveProjectPath(string value)
        {
            return Path.IsPathRooted(value)
                ? Path.GetFullPath(value)
                : Path.GetFullPath(Path.Combine(ProjectRoot, value));
        }

        private static List<object> DiagnosticDocuments(
            IEnumerable<BrazeExportDiagnostic> diagnostics)
        {
            return diagnostics.Select(item => (object)new Dictionary<string, object>
            {
                ["code"] = item.code,
                ["severity"] = item.severity,
                ["message"] = item.message,
                ["unityPath"] = item.unityPath,
            }).ToList();
        }

        private static void WriteResult(Dictionary<string, object> result)
        {
            Directory.CreateDirectory(RequestDirectory);
            var temporaryPath = ResultPath + "." + Guid.NewGuid().ToString("N") + ".tmp";
            File.WriteAllText(temporaryPath, BrazeJson.Serialize(result, true) + "\n");
            if (File.Exists(ResultPath))
            {
                File.Replace(temporaryPath, ResultPath, null);
                return;
            }
            File.Move(temporaryPath, ResultPath);
        }

        [Serializable]
        private sealed class BrazeBridgeExportRequest
        {
            public string requestId = "";
            public string prefabPath = "";
            public string outputPath = "";
            public string manifestPath = "";
            public bool failOnWarning = false;
        }
    }
}
