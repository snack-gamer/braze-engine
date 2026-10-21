using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using UnityEditor;
using UnityEngine;

namespace Braze.Bridge.Editor
{
    public sealed class BrazeStaticPrefabExportOptions
    {
        public string PrefabAssetPath { get; set; }
        public string GlbOutputPath { get; set; }
        public string ManifestOutputPath { get; set; }
        public bool OverwriteExisting { get; set; }
        public bool FailOnWarnings { get; set; }
    }

    public sealed class BrazeStaticPrefabExportResult
    {
        public string GlbOutputPath { get; internal set; }
        public string ManifestOutputPath { get; internal set; }
        public string SourceUnityGuid { get; internal set; }
        public string GlbSha256 { get; internal set; }
        public IReadOnlyList<BrazeExportDiagnostic> Diagnostics { get; internal set; }
    }

    public static class BrazeStaticPrefabExporter
    {
        private static readonly HashSet<Type> SupportedComponentTypes = new HashSet<Type>
        {
            typeof(Transform),
            typeof(MeshFilter),
            typeof(MeshRenderer),
            typeof(MeshCollider),
            typeof(BoxCollider),
            typeof(SphereCollider),
            typeof(CapsuleCollider),
        };

        public static BrazeStaticPrefabExportResult Export(BrazeStaticPrefabExportOptions options)
        {
            if (options == null)
            {
                throw new ArgumentNullException(nameof(options));
            }

            var diagnostics = new BrazeDiagnosticBag();
            var prefabAssetPath = NormalizeAssetPath(options.PrefabAssetPath);
            var glbOutputPath = NormalizeOutputPath(options.GlbOutputPath, ".glb");
            var manifestOutputPath = string.IsNullOrWhiteSpace(options.ManifestOutputPath)
                ? Path.ChangeExtension(glbOutputPath, ".braze-export.json")
                : NormalizeOutputPath(options.ManifestOutputPath, ".json");

            ValidateOutputPaths(glbOutputPath, manifestOutputPath, options.OverwriteExisting, diagnostics);
            var prefabAsset = ValidatePrefabAsset(prefabAssetPath, diagnostics);
            AssetDatabase.TryGetGUIDAndLocalFileIdentifier(
                prefabAsset,
                out var prefabGuid,
                out long prefabFileId);
            if (string.IsNullOrEmpty(prefabGuid))
            {
                diagnostics.Error(
                    "missing-prefab-identity",
                    "Unity did not provide a GUID/fileID for the prefab asset.",
                    prefabAssetPath);
            }

            ValidateNoNestedPrefabs(prefabAssetPath, diagnostics);
            ThrowForErrors(diagnostics);

            GameObject contents = null;
            try
            {
                contents = PrefabUtility.LoadPrefabContents(prefabAssetPath);
                ValidatePrefabContents(contents, diagnostics);
                ThrowForErrors(diagnostics);

                BrazeGlbBuildResult build;
                using (var builder = new BrazeGlbBuilder(
                           contents,
                           prefabAssetPath,
                           prefabGuid,
                           prefabFileId,
                           diagnostics))
                {
                    build = builder.Build();
                }

                if (options.FailOnWarnings && diagnostics.HasWarnings)
                {
                    throw new BrazeExportException(
                        "GLB export produced warnings and -brazeFailOnWarning was enabled.",
                        diagnostics.Items);
                }

                var manifest = BuildManifest(
                    prefabAsset,
                    prefabAssetPath,
                    prefabGuid,
                    prefabFileId,
                    glbOutputPath,
                    build,
                    diagnostics.Items);
                var manifestBytes = new UTF8Encoding(false).GetBytes(
                    BrazeJson.Serialize(manifest, true) + "\n");

                PublishOutputs(
                    glbOutputPath,
                    build.GlbBytes,
                    manifestOutputPath,
                    manifestBytes,
                    options.OverwriteExisting);

                diagnostics.Info(
                    "export-complete",
                    $"Exported {build.Nodes.Count} mesh nodes and {build.Textures.Count} embedded PNG textures.",
                    prefabAssetPath);

                return new BrazeStaticPrefabExportResult
                {
                    GlbOutputPath = glbOutputPath,
                    ManifestOutputPath = manifestOutputPath,
                    SourceUnityGuid = prefabGuid,
                    GlbSha256 = build.Sha256,
                    Diagnostics = diagnostics.Items.ToArray(),
                };
            }
            finally
            {
                if (contents != null)
                {
                    PrefabUtility.UnloadPrefabContents(contents);
                }
            }
        }

        private static GameObject ValidatePrefabAsset(
            string prefabAssetPath,
            BrazeDiagnosticBag diagnostics)
        {
            if (string.IsNullOrWhiteSpace(prefabAssetPath))
            {
                diagnostics.Error("missing-prefab-path", "A Unity prefab asset path is required.");
                ThrowForErrors(diagnostics);
            }

            if (!prefabAssetPath.EndsWith(".prefab", StringComparison.OrdinalIgnoreCase))
            {
                diagnostics.Error(
                    "not-a-prefab",
                    "The source path must identify a .prefab asset.",
                    prefabAssetPath);
            }

            var prefabAsset = AssetDatabase.LoadAssetAtPath<GameObject>(prefabAssetPath);
            if (prefabAsset == null)
            {
                diagnostics.Error(
                    "prefab-not-found",
                    "Unity could not load a prefab asset at this path.",
                    prefabAssetPath);
                ThrowForErrors(diagnostics);
            }

            if (PrefabUtility.GetPrefabAssetType(prefabAsset) == PrefabAssetType.Model)
            {
                diagnostics.Error(
                    "model-prefab-not-supported",
                    "Select an authored .prefab that assigns materials and colliders, not the imported FBX model prefab.",
                    prefabAssetPath);
            }

            return prefabAsset;
        }

        private static void ValidateNoNestedPrefabs(
            string prefabAssetPath,
            BrazeDiagnosticBag diagnostics)
        {
            var nested = AssetDatabase.GetDependencies(prefabAssetPath, true)
                .Where(path => path.EndsWith(".prefab", StringComparison.OrdinalIgnoreCase))
                .Where(path => !string.Equals(path, prefabAssetPath, StringComparison.OrdinalIgnoreCase))
                .OrderBy(path => path, StringComparer.Ordinal)
                .ToArray();
            if (nested.Length == 0)
            {
                return;
            }

            diagnostics.Error(
                "nested-prefab-not-supported",
                "This exporter slice intentionally rejects nested prefab dependencies: " +
                string.Join(", ", nested),
                prefabAssetPath);
        }

        private static void ValidatePrefabContents(
            GameObject root,
            BrazeDiagnosticBag diagnostics)
        {
            var transforms = root.GetComponentsInChildren<Transform>(true)
                .OrderBy(transform => TransformPath(root.transform, transform), StringComparer.Ordinal)
                .ToArray();
            foreach (var transform in transforms)
            {
                var unityPath = TransformPath(root.transform, transform);
                if (!transform.gameObject.activeSelf)
                {
                    diagnostics.Error(
                        "inactive-object-not-supported",
                        "Inactive prefab objects cannot be represented faithfully by this static GLB slice.",
                        unityPath);
                }

                var components = transform.GetComponents<Component>();
                foreach (var component in components)
                {
                    if (component == null)
                    {
                        diagnostics.Error(
                            "missing-script",
                            "The prefab contains a missing component/script reference.",
                            unityPath);
                        continue;
                    }

                    if (!SupportedComponentTypes.Contains(component.GetType()))
                    {
                        diagnostics.Error(
                            "unsupported-component",
                            $"{component.GetType().FullName} is not supported by the static-prefab exporter.",
                            unityPath);
                    }
                }

                ValidateRendererPair(transform, unityPath, diagnostics);
                ValidateColliders(transform, unityPath, diagnostics);
            }

            if (!root.GetComponentsInChildren<MeshFilter>(true).Any())
            {
                diagnostics.Error(
                    "no-mesh-filters",
                    "The prefab has no MeshFilter components to export.",
                    root.name);
            }

            foreach (var repeated in root.GetComponentsInChildren<MeshFilter>(true)
                         .Where(filter => filter.sharedMesh != null)
                         .GroupBy(filter => filter.sharedMesh)
                         .Where(group => group.Count() > 1))
            {
                diagnostics.Error(
                    "reused-mesh-with-baked-transforms-not-supported",
                    $"Mesh asset '{repeated.Key.name}' is assigned to multiple objects ({string.Join(", ", repeated.Select(item => TransformPath(root.transform, item.transform)))})). " +
                    "This slice cannot give multiple baked copies one unambiguous Unity mesh local ID.",
                    root.name);
            }
        }

        private static void ValidateRendererPair(
            Transform transform,
            string unityPath,
            BrazeDiagnosticBag diagnostics)
        {
            var filter = transform.GetComponent<MeshFilter>();
            var renderer = transform.GetComponent<MeshRenderer>();
            if (filter == null && renderer == null)
            {
                return;
            }
            if (filter == null || renderer == null)
            {
                diagnostics.Error(
                    "incomplete-mesh-renderer",
                    "A static mesh object must have both MeshFilter and MeshRenderer components.",
                    unityPath);
                return;
            }
            if (!renderer.enabled)
            {
                diagnostics.Error(
                    "disabled-renderer-not-supported",
                    "Disabled MeshRenderer state is not represented by this GLB slice.",
                    unityPath);
            }
            if (filter.sharedMesh == null)
            {
                diagnostics.Error("missing-mesh", "MeshFilter has no assigned mesh.", unityPath);
                return;
            }

            var mesh = filter.sharedMesh;
            if (mesh.blendShapeCount > 0)
            {
                diagnostics.Error(
                    "blend-shapes-not-supported",
                    "Blend shapes are outside the static-prefab export slice.",
                    unityPath);
            }
            if (!TryAssetIdentity(mesh, out _, out _))
            {
                diagnostics.Error(
                    "mesh-has-no-stable-identity",
                    "The mesh must be a persistent Unity asset with a GUID/fileID.",
                    unityPath);
            }

            var materials = renderer.sharedMaterials;
            if (materials.Length == 0)
            {
                diagnostics.Error(
                    "missing-materials",
                    "MeshRenderer has no material assignments.",
                    unityPath);
                return;
            }
            if (materials.Length != mesh.subMeshCount)
            {
                diagnostics.Warning(
                    "material-slot-count-mismatch",
                    $"Mesh has {mesh.subMeshCount} submeshes but renderer has {materials.Length} material slots; " +
                    "Unity's last-slot fallback will be used.",
                    unityPath);
            }

            for (var subMesh = 0; subMesh < mesh.subMeshCount; subMesh += 1)
            {
                var material = materials[Math.Min(subMesh, materials.Length - 1)];
                if (material == null)
                {
                    diagnostics.Error(
                        "missing-material",
                        $"Resolved material slot {subMesh} is null.",
                        unityPath);
                    continue;
                }
                if (!TryAssetIdentity(material, out _, out _))
                {
                    diagnostics.Error(
                        "material-has-no-stable-identity",
                        $"Material '{material.name}' must be a persistent Unity asset with a GUID/fileID.",
                        unityPath);
                }

                foreach (var propertyName in material.GetTexturePropertyNames())
                {
                    var assigned = material.GetTexture(propertyName);
                    if (assigned == null)
                    {
                        continue;
                    }
                    if (!(assigned is Texture2D texture))
                    {
                        diagnostics.Error(
                            "unsupported-texture-kind",
                            $"Material property {propertyName} uses {assigned.GetType().Name}; only Texture2D is supported.",
                            unityPath);
                        continue;
                    }
                    if (!TryAssetIdentity(texture, out _, out _))
                    {
                        diagnostics.Error(
                            "texture-has-no-stable-identity",
                            $"Texture '{texture.name}' must be a persistent Unity asset with a GUID/fileID.",
                            unityPath);
                    }
                }
            }
        }

        private static void ValidateColliders(
            Transform transform,
            string unityPath,
            BrazeDiagnosticBag diagnostics)
        {
            foreach (var collider in transform.GetComponents<Collider>())
            {
                if (collider.sharedMaterial != null &&
                    !TryAssetIdentity(collider.sharedMaterial, out _, out _))
                {
                    diagnostics.Error(
                        "physics-material-has-no-stable-identity",
                        "Collider physics material must be a persistent Unity asset with a GUID/fileID.",
                        unityPath);
                }

                if (!(collider is MeshCollider meshCollider))
                {
                    continue;
                }
                if (meshCollider.sharedMesh == null)
                {
                    diagnostics.Error(
                        "missing-collider-mesh",
                        "MeshCollider has no assigned mesh.",
                        unityPath);
                }
                else if (!TryAssetIdentity(meshCollider.sharedMesh, out _, out _))
                {
                    diagnostics.Error(
                        "collider-mesh-has-no-stable-identity",
                        "MeshCollider mesh must be a persistent Unity asset with a GUID/fileID.",
                        unityPath);
                }
            }
        }

        private static Dictionary<string, object> BuildManifest(
            GameObject prefabAsset,
            string prefabAssetPath,
            string prefabGuid,
            long prefabFileId,
            string glbOutputPath,
            BrazeGlbBuildResult build,
            IReadOnlyList<BrazeExportDiagnostic> diagnostics)
        {
            return new Dictionary<string, object>
            {
                ["schemaVersion"] = 1,
                ["kind"] = "braze.unity-static-prefab-export",
                ["exporter"] = new Dictionary<string, object>
                {
                    ["package"] = "com.braze.bridge",
                    ["version"] = "0.1.0",
                    ["unityVersion"] = Application.unityVersion,
                },
                ["source"] = new Dictionary<string, object>
                {
                    ["name"] = prefabAsset.name,
                    ["assetPath"] = prefabAssetPath,
                    ["unityGuid"] = prefabGuid,
                    ["unityFileId"] = prefabFileId.ToString(CultureInfo.InvariantCulture),
                    ["brazeLocalId"] = $"prefab:{prefabGuid}:{prefabFileId.ToString(CultureInfo.InvariantCulture)}",
                },
                ["output"] = new Dictionary<string, object>
                {
                    ["glb"] = Path.GetFileName(glbOutputPath),
                    ["sha256"] = build.Sha256,
                    ["selfContained"] = true,
                    ["embeddedTextureFormat"] = "image/png",
                },
                ["coordinateSystem"] = new Dictionary<string, object>
                {
                    ["source"] = "Unity left-handed, Y-up",
                    ["target"] = "glTF right-handed, Y-up",
                    ["axisMapping"] = "(x,y,z) -> (x,y,-z)",
                    ["assetForwardMapping"] = "+Z Unity -> -Z glTF",
                    ["geometrySpace"] = "prefab-root",
                    ["nodeTransformsBaked"] = true,
                    ["uvVFlipped"] = true,
                },
                ["recommendedBrazeModelSettings"] = new Dictionary<string, object>
                {
                    ["scaleFactor"] = 1f,
                    ["convertUnits"] = true,
                    ["sourceUnit"] = "meter",
                    ["fitToEditorSize"] = false,
                    ["importMaterials"] = true,
                    ["importAnimations"] = false,
                    ["generateColliders"] = false,
                },
                ["bounds"] = build.Bounds,
                ["nodes"] = build.Nodes,
                ["materials"] = build.Materials,
                ["textures"] = build.Textures,
                ["colliders"] = build.Colliders,
                ["diagnostics"] = diagnostics.Select(DiagnosticDocument).Cast<object>().ToList(),
            };
        }

        private static Dictionary<string, object> DiagnosticDocument(BrazeExportDiagnostic diagnostic)
        {
            return new Dictionary<string, object>
            {
                ["code"] = diagnostic.code,
                ["severity"] = diagnostic.severity,
                ["message"] = diagnostic.message,
                ["unityPath"] = diagnostic.unityPath,
            };
        }

        private static void ValidateOutputPaths(
            string glbOutputPath,
            string manifestOutputPath,
            bool overwrite,
            BrazeDiagnosticBag diagnostics)
        {
            if (string.Equals(glbOutputPath, manifestOutputPath, StringComparison.OrdinalIgnoreCase))
            {
                diagnostics.Error("output-path-collision", "GLB and manifest paths must be different.");
            }
            if (!overwrite && File.Exists(glbOutputPath))
            {
                diagnostics.Error("output-exists", "GLB output already exists; enable overwrite explicitly.", glbOutputPath);
            }
            if (!overwrite && File.Exists(manifestOutputPath))
            {
                diagnostics.Error("manifest-exists", "Manifest output already exists; enable overwrite explicitly.", manifestOutputPath);
            }
            ThrowForErrors(diagnostics);
        }

        private static void PublishOutputs(
            string glbPath,
            byte[] glb,
            string manifestPath,
            byte[] manifest,
            bool overwrite)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(glbPath) ?? ".");
            Directory.CreateDirectory(Path.GetDirectoryName(manifestPath) ?? ".");

            var nonce = Guid.NewGuid().ToString("N");
            var temporaryGlb = glbPath + "." + nonce + ".tmp";
            var temporaryManifest = manifestPath + "." + nonce + ".tmp";
            try
            {
                File.WriteAllBytes(temporaryGlb, glb);
                File.WriteAllBytes(temporaryManifest, manifest);
                PublishOne(temporaryGlb, glbPath, overwrite);
                PublishOne(temporaryManifest, manifestPath, overwrite);
            }
            finally
            {
                if (File.Exists(temporaryGlb)) File.Delete(temporaryGlb);
                if (File.Exists(temporaryManifest)) File.Delete(temporaryManifest);
            }
        }

        private static void PublishOne(string temporaryPath, string finalPath, bool overwrite)
        {
            if (File.Exists(finalPath))
            {
                if (!overwrite)
                {
                    throw new IOException("Output already exists: " + finalPath);
                }
                File.Replace(temporaryPath, finalPath, null);
                return;
            }
            File.Move(temporaryPath, finalPath);
        }

        private static bool TryAssetIdentity(UnityEngine.Object asset, out string guid, out long fileId)
        {
            if (asset == null || !EditorUtility.IsPersistent(asset))
            {
                guid = "";
                fileId = 0;
                return false;
            }
            return AssetDatabase.TryGetGUIDAndLocalFileIdentifier(asset, out guid, out fileId) &&
                   !string.IsNullOrEmpty(guid);
        }

        private static string NormalizeAssetPath(string path)
        {
            return (path ?? "").Trim().Replace('\\', '/');
        }

        private static string NormalizeOutputPath(string path, string requiredExtension)
        {
            if (string.IsNullOrWhiteSpace(path))
            {
                throw new ArgumentException("An output path is required.", nameof(path));
            }
            var fullPath = Path.GetFullPath(path.Trim());
            if (!fullPath.EndsWith(requiredExtension, StringComparison.OrdinalIgnoreCase))
            {
                throw new ArgumentException(
                    $"Output path must end in {requiredExtension}: {fullPath}",
                    nameof(path));
            }
            return fullPath;
        }

        private static string TransformPath(Transform root, Transform transform)
        {
            var parts = new List<string>();
            var cursor = transform;
            while (cursor != null)
            {
                parts.Add(cursor.name);
                if (cursor == root) break;
                cursor = cursor.parent;
            }
            parts.Reverse();
            return string.Join("/", parts);
        }

        private static void ThrowForErrors(BrazeDiagnosticBag diagnostics)
        {
            if (diagnostics.HasErrors)
            {
                throw new BrazeExportException("Static prefab export validation failed.", diagnostics.Items);
            }
        }
    }
}
