using System;
using System.IO;
using UnityEditor;
using UnityEngine;

namespace Braze.Bridge.Editor
{
    internal static class BrazeBridgeMenu
    {
        private const string MenuPath = "Assets/Export to Braze/Selected Static Prefab as GLB...";

        [MenuItem(MenuPath, true)]
        private static bool ValidateExportSelected()
        {
            var path = AssetDatabase.GetAssetPath(Selection.activeObject);
            return !string.IsNullOrEmpty(path) &&
                   path.EndsWith(".prefab", StringComparison.OrdinalIgnoreCase);
        }

        [MenuItem(MenuPath, false, 2000)]
        private static void ExportSelected()
        {
            var prefabPath = AssetDatabase.GetAssetPath(Selection.activeObject);
            var defaultName = Path.GetFileNameWithoutExtension(prefabPath) + ".glb";
            var outputPath = EditorUtility.SaveFilePanel(
                "Export static prefab to Braze GLB",
                Directory.GetParent(Application.dataPath)?.FullName ?? Application.dataPath,
                defaultName,
                "glb");
            if (string.IsNullOrEmpty(outputPath))
            {
                return;
            }

            try
            {
                var result = BrazeStaticPrefabExporter.Export(new BrazeStaticPrefabExportOptions
                {
                    PrefabAssetPath = prefabPath,
                    GlbOutputPath = outputPath,
                    OverwriteExisting = true,
                });
                foreach (var diagnostic in result.Diagnostics)
                {
                    LogDiagnostic(diagnostic);
                }
                Debug.Log(
                    $"Braze Bridge exported '{prefabPath}' to '{result.GlbOutputPath}' " +
                    $"with manifest '{result.ManifestOutputPath}'.");
                EditorUtility.RevealInFinder(result.GlbOutputPath);
            }
            catch (BrazeExportException exception)
            {
                foreach (var diagnostic in exception.Diagnostics)
                {
                    LogDiagnostic(diagnostic);
                }
                Debug.LogException(exception);
                EditorUtility.DisplayDialog(
                    "Braze export failed",
                    exception.Message,
                    "OK");
            }
            catch (Exception exception)
            {
                Debug.LogException(exception);
                EditorUtility.DisplayDialog(
                    "Braze export failed",
                    exception.Message,
                    "OK");
            }
        }

        internal static void LogDiagnostic(BrazeExportDiagnostic diagnostic)
        {
            switch (diagnostic.severity)
            {
                case "error": Debug.LogError(diagnostic.ToString()); break;
                case "warning": Debug.LogWarning(diagnostic.ToString()); break;
                default: Debug.Log(diagnostic.ToString()); break;
            }
        }
    }
}
