using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEngine;

namespace Braze.Bridge.Editor
{
    public static class BrazeBridgeCli
    {
        // Unity CLI entry point:
        // -executeMethod Braze.Bridge.Editor.BrazeBridgeCli.Export
        public static void Export()
        {
            try
            {
                var arguments = ParseArguments(Environment.GetCommandLineArgs());
                var projectRoot = Directory.GetParent(Application.dataPath)?.FullName ?? Directory.GetCurrentDirectory();
                var output = Require(arguments, "-brazeOutput");
                if (!Path.IsPathRooted(output))
                {
                    output = Path.Combine(projectRoot, output);
                }

                arguments.TryGetValue("-brazeManifest", out var manifest);
                if (!string.IsNullOrEmpty(manifest) && !Path.IsPathRooted(manifest))
                {
                    manifest = Path.Combine(projectRoot, manifest);
                }

                var result = BrazeStaticPrefabExporter.Export(new BrazeStaticPrefabExportOptions
                {
                    PrefabAssetPath = Require(arguments, "-brazePrefab"),
                    GlbOutputPath = output,
                    ManifestOutputPath = manifest,
                    OverwriteExisting = Flag(arguments, "-brazeOverwrite"),
                    FailOnWarnings = Flag(arguments, "-brazeFailOnWarning"),
                });
                foreach (var diagnostic in result.Diagnostics)
                {
                    BrazeBridgeMenu.LogDiagnostic(diagnostic);
                }
                Debug.Log(
                    $"Braze Bridge export complete. GLB='{result.GlbOutputPath}', " +
                    $"manifest='{result.ManifestOutputPath}', sha256='{result.GlbSha256}'.");
            }
            catch (BrazeExportException exception)
            {
                foreach (var diagnostic in exception.Diagnostics)
                {
                    BrazeBridgeMenu.LogDiagnostic(diagnostic);
                }
                Fail(exception);
            }
            catch (Exception exception)
            {
                Fail(exception);
            }
        }

        private static void Fail(Exception exception)
        {
            Debug.LogException(exception);
            if (Application.isBatchMode)
            {
                EditorApplication.Exit(1);
                return;
            }
            throw exception;
        }

        private static Dictionary<string, string> ParseArguments(string[] arguments)
        {
            var output = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            for (var index = 0; index < arguments.Length; index += 1)
            {
                var argument = arguments[index];
                if (!argument.StartsWith("-braze", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                var equals = argument.IndexOf('=');
                if (equals > 0)
                {
                    output[argument.Substring(0, equals)] = argument.Substring(equals + 1);
                    continue;
                }

                if (index + 1 < arguments.Length &&
                    !arguments[index + 1].StartsWith("-", StringComparison.Ordinal))
                {
                    output[argument] = arguments[index + 1];
                    index += 1;
                }
                else
                {
                    output[argument] = "true";
                }
            }
            return output;
        }

        private static string Require(Dictionary<string, string> arguments, string name)
        {
            if (!arguments.TryGetValue(name, out var value) || string.IsNullOrWhiteSpace(value))
            {
                throw new ArgumentException("Missing required command-line option " + name + ".");
            }
            return value;
        }

        private static bool Flag(Dictionary<string, string> arguments, string name)
        {
            if (!arguments.TryGetValue(name, out var value))
            {
                return false;
            }
            return string.IsNullOrEmpty(value) ||
                   value == "1" ||
                   value.Equals("true", StringComparison.OrdinalIgnoreCase) ||
                   value.Equals("yes", StringComparison.OrdinalIgnoreCase);
        }
    }
}
