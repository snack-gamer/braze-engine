using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace Braze.Bridge.Editor
{
    internal sealed class BrazeGlbBuildResult
    {
        public byte[] GlbBytes;
        public string Sha256;
        public Dictionary<string, object> Bounds;
        public List<object> Nodes;
        public List<object> Materials;
        public List<object> Textures;
        public List<object> Colliders;
    }

    internal sealed class BrazeGlbBuilder : IDisposable
    {
        private const int ArrayBufferTarget = 34962;
        private const int ElementArrayBufferTarget = 34963;
        private const int FloatComponentType = 5126;
        private const int UnsignedIntComponentType = 5125;

        private readonly GameObject root;
        private readonly string prefabAssetPath;
        private readonly string prefabGuid;
        private readonly long prefabFileId;
        private readonly BrazeDiagnosticBag diagnostics;
        private readonly MemoryStream binary = new MemoryStream();
        private readonly BinaryWriter writer;

        private readonly List<object> bufferViews = new List<object>();
        private readonly List<object> accessors = new List<object>();
        private readonly List<object> images = new List<object>();
        private readonly List<object> samplers = new List<object>();
        private readonly List<object> textures = new List<object>();
        private readonly List<object> materials = new List<object>();
        private readonly List<object> meshes = new List<object>();
        private readonly List<object> nodes = new List<object>();

        private readonly List<object> manifestNodes = new List<object>();
        private readonly List<object> manifestMaterials = new List<object>();
        private readonly List<object> manifestTextures = new List<object>();
        private readonly List<object> manifestColliders = new List<object>();

        private readonly Dictionary<Material, int> materialIndices =
            new Dictionary<Material, int>();
        private readonly Dictionary<Texture2D, int> textureIndices =
            new Dictionary<Texture2D, int>();
        private readonly Dictionary<Texture2D, int> luminanceAlphaTextureIndices =
            new Dictionary<Texture2D, int>();

        private readonly HashSet<string> extensionsUsed = new HashSet<string>();
        private bool hasBounds;
        private Vector3 boundsMin;
        private Vector3 boundsMax;

        public BrazeGlbBuilder(
            GameObject root,
            string prefabAssetPath,
            string prefabGuid,
            long prefabFileId,
            BrazeDiagnosticBag diagnostics)
        {
            this.root = root;
            this.prefabAssetPath = prefabAssetPath;
            this.prefabGuid = prefabGuid;
            this.prefabFileId = prefabFileId;
            this.diagnostics = diagnostics;
            writer = new BinaryWriter(binary, Encoding.UTF8, true);
        }

        public BrazeGlbBuildResult Build()
        {
            var filters = root.GetComponentsInChildren<MeshFilter>(true)
                .OrderBy(filter => TransformPath(filter.transform), StringComparer.Ordinal)
                .ToArray();

            foreach (var filter in filters)
            {
                ExportMeshFilter(filter);
            }

            ExportColliderSummary();

            if (nodes.Count == 0)
            {
                diagnostics.Error(
                    "no-renderable-meshes",
                    "The prefab contains no supported MeshFilter/MeshRenderer pairs.",
                    prefabAssetPath);
                throw new BrazeExportException("GLB export validation failed.", diagnostics.Items);
            }

            var document = BuildDocument();
            var json = BrazeJson.Serialize(document);
            var glb = BuildGlb(json, binary.ToArray());

            return new BrazeGlbBuildResult
            {
                GlbBytes = glb,
                Sha256 = Sha256(glb),
                Bounds = BoundsDocument(boundsMin, boundsMax),
                Nodes = manifestNodes,
                Materials = manifestMaterials,
                Textures = manifestTextures,
                Colliders = manifestColliders,
            };
        }

        public void Dispose()
        {
            writer.Dispose();
            binary.Dispose();
        }

        private void ExportMeshFilter(MeshFilter filter)
        {
            var renderer = filter.GetComponent<MeshRenderer>();
            if (renderer == null || filter.sharedMesh == null)
            {
                return;
            }

            var mesh = filter.sharedMesh;
            var identity = AssetIdentity.For(mesh);
            var transformPath = TransformPath(filter.transform);
            var bake = root.transform.worldToLocalMatrix * filter.transform.localToWorldMatrix;
            var determinant = bake.determinant;
            if (Mathf.Abs(determinant) < 1e-8f)
            {
                diagnostics.Error(
                    "singular-transform",
                    "Mesh geometry cannot be baked through a zero-scale or singular transform.",
                    transformPath);
                throw new BrazeExportException("GLB export validation failed.", diagnostics.Items);
            }

            Vector3[] sourcePositions;
            Vector3[] sourceNormals;
            Vector4[] sourceTangents;
            Vector2[] sourceUvs;
            Color[] sourceColors;
            try
            {
                sourcePositions = mesh.vertices;
                sourceNormals = mesh.normals;
                sourceTangents = mesh.tangents;
                sourceUvs = mesh.uv;
                sourceColors = mesh.colors;
            }
            catch (Exception exception)
            {
                diagnostics.Error(
                    "mesh-not-readable",
                    $"Unity could not read mesh data: {exception.Message}",
                    identity.AssetPath);
                throw new BrazeExportException("GLB export validation failed.", diagnostics.Items);
            }

            if (sourcePositions.Length == 0)
            {
                diagnostics.Warning("empty-mesh", "An empty mesh was skipped.", transformPath);
                return;
            }

            var positions = new Vector3[sourcePositions.Length];
            var normalMatrix = bake.inverse.transpose;
            var normals = sourceNormals.Length == sourcePositions.Length
                ? new Vector3[sourceNormals.Length]
                : Array.Empty<Vector3>();
            var tangents = sourceTangents.Length == sourcePositions.Length
                ? new Vector4[sourceTangents.Length]
                : Array.Empty<Vector4>();
            var uvs = sourceUvs.Length == sourcePositions.Length
                ? new Vector2[sourceUvs.Length]
                : Array.Empty<Vector2>();

            var nodeMin = new Vector3(float.PositiveInfinity, float.PositiveInfinity, float.PositiveInfinity);
            var nodeMax = new Vector3(float.NegativeInfinity, float.NegativeInfinity, float.NegativeInfinity);
            for (var index = 0; index < sourcePositions.Length; index += 1)
            {
                var position = ToGltfPosition(bake.MultiplyPoint3x4(sourcePositions[index]));
                positions[index] = position;
                nodeMin = Vector3.Min(nodeMin, position);
                nodeMax = Vector3.Max(nodeMax, position);

                if (normals.Length > 0)
                {
                    normals[index] = ToGltfDirection(
                        normalMatrix.MultiplyVector(sourceNormals[index]).normalized);
                }

                if (tangents.Length > 0)
                {
                    var sourceTangent = sourceTangents[index];
                    var tangentDirection = bake.MultiplyVector(
                        new Vector3(sourceTangent.x, sourceTangent.y, sourceTangent.z)).normalized;
                    tangentDirection = ToGltfDirection(tangentDirection);
                    var orientationSign = determinant < 0f ? -1f : 1f;
                    // The handedness reflection flips tangent W once; the UV
                    // V inversion flips it back. Negative baked scale remains.
                    tangents[index] = new Vector4(
                        tangentDirection.x,
                        tangentDirection.y,
                        tangentDirection.z,
                        sourceTangent.w * orientationSign);
                }

                if (uvs.Length > 0)
                {
                    // Unity UVs use a bottom-left origin. glTF images use a
                    // top-left origin, so V is inverted while PNG pixels stay
                    // in their normal encoded orientation.
                    uvs[index] = new Vector2(sourceUvs[index].x, 1f - sourceUvs[index].y);
                }
            }

            IncludeBounds(nodeMin, nodeMax);

            var attributes = new Dictionary<string, object>
            {
                ["POSITION"] = AddVector3Accessor(positions, true),
            };
            if (normals.Length > 0)
            {
                attributes["NORMAL"] = AddVector3Accessor(normals, false);
            }
            if (tangents.Length > 0)
            {
                attributes["TANGENT"] = AddVector4Accessor(tangents);
            }
            if (uvs.Length > 0)
            {
                attributes["TEXCOORD_0"] = AddVector2Accessor(uvs);
            }
            if (sourceColors.Length == sourcePositions.Length)
            {
                attributes["COLOR_0"] = AddColorAccessor(sourceColors);
            }

            var primitiveDocuments = new List<object>();
            var materialManifest = new List<object>();
            var assignedMaterials = renderer.sharedMaterials;
            for (var subMesh = 0; subMesh < mesh.subMeshCount; subMesh += 1)
            {
                if (mesh.GetTopology(subMesh) != MeshTopology.Triangles)
                {
                    diagnostics.Error(
                        "unsupported-mesh-topology",
                        $"Submesh {subMesh} uses {mesh.GetTopology(subMesh)}; only triangles are supported.",
                        transformPath);
                    throw new BrazeExportException("GLB export validation failed.", diagnostics.Items);
                }

                var indices = mesh.GetIndices(subMesh, true);
                if (indices.Length % 3 != 0)
                {
                    diagnostics.Error(
                        "invalid-triangle-indices",
                        $"Submesh {subMesh} has an index count that is not divisible by three.",
                        transformPath);
                    throw new BrazeExportException("GLB export validation failed.", diagnostics.Items);
                }

                // Reflecting source +Z into output -Z reverses handedness. A
                // baked negative-scale transform contributes a second reflection.
                if (determinant > 0f)
                {
                    for (var triangle = 0; triangle < indices.Length; triangle += 3)
                    {
                        var temporary = indices[triangle + 1];
                        indices[triangle + 1] = indices[triangle + 2];
                        indices[triangle + 2] = temporary;
                    }
                }

                var material = assignedMaterials[Math.Min(subMesh, assignedMaterials.Length - 1)];
                var materialIndex = EnsureMaterial(material);
                var materialIdentity = AssetIdentity.For(material);
                materialManifest.Add(materialIdentity.ManifestDocument());

                primitiveDocuments.Add(new Dictionary<string, object>
                {
                    ["attributes"] = attributes,
                    ["indices"] = AddIndexAccessor(indices),
                    ["material"] = materialIndex,
                    ["mode"] = 4,
                    ["extras"] = new Dictionary<string, object>
                    {
                        ["brazeLocalId"] = $"primitive:{identity.Guid}:{identity.FileIdText}:{subMesh}",
                        ["unityMeshGuid"] = identity.Guid,
                        ["unityMeshFileId"] = identity.FileIdText,
                        ["unitySubMesh"] = subMesh,
                        ["unityMaterialGuid"] = materialIdentity.Guid,
                        ["unityMaterialFileId"] = materialIdentity.FileIdText,
                    },
                });
            }

            var meshIndex = meshes.Count;
            var meshLocalId = identity.BrazeLocalId("mesh");
            meshes.Add(new Dictionary<string, object>
            {
                ["name"] = filter.gameObject.name,
                ["primitives"] = primitiveDocuments,
                ["extras"] = new Dictionary<string, object>
                {
                    ["brazeLocalId"] = meshLocalId,
                    ["unityAssetPath"] = identity.AssetPath,
                    ["unityGuid"] = identity.Guid,
                    ["unityFileId"] = identity.FileIdText,
                },
            });

            nodes.Add(new Dictionary<string, object>
            {
                ["name"] = filter.gameObject.name,
                ["mesh"] = meshIndex,
                ["extras"] = new Dictionary<string, object>
                {
                    ["brazeLocalId"] = meshLocalId,
                    ["unityAssetPath"] = identity.AssetPath,
                    ["unityGuid"] = identity.Guid,
                    ["unityFileId"] = identity.FileIdText,
                    ["unityPrefabAssetPath"] = prefabAssetPath,
                    ["unityPrefabGuid"] = prefabGuid,
                    ["unityTransformPath"] = transformPath,
                    ["geometrySpace"] = "prefab-root",
                },
            });

            manifestNodes.Add(new Dictionary<string, object>
            {
                ["name"] = filter.gameObject.name,
                ["unityTransformPath"] = transformPath,
                ["brazeLocalId"] = meshLocalId,
                ["mesh"] = identity.ManifestDocument(),
                ["materials"] = materialManifest,
                ["bounds"] = BoundsDocument(nodeMin, nodeMax),
                ["vertexCount"] = sourcePositions.Length,
                ["subMeshCount"] = mesh.subMeshCount,
            });
        }

        private int EnsureMaterial(Material material)
        {
            if (materialIndices.TryGetValue(material, out var existing))
            {
                return existing;
            }

            var identity = AssetIdentity.For(material);
            var shaderName = material.shader == null ? "" : material.shader.name;
            var isLightsHint = material.name.IndexOf("Light", StringComparison.OrdinalIgnoreCase) >= 0;
            var baseColor = MaterialColor(material, "_BaseColor", "_Color", Color.white);
            var baseTexture = FirstTexture(material, "_BaseMap", "_MainTex", "_TextureSample1", "_TextureSample");
            var emissionTexture = FirstTexture(material, "_EmissionMap") ?? (isLightsHint ? baseTexture : null);
            var emissionColor = MaterialColor(
                material,
                "_EmissionColor",
                null,
                isLightsHint ? Color.white : Color.black);
            var maxEmission = Mathf.Max(emissionColor.r, emissionColor.g, emissionColor.b);
            var isEmissive = emissionTexture != null || maxEmission > 0.0001f;
            var isAdditiveApproximation = isLightsHint ||
                                          shaderName.IndexOf("Additive", StringComparison.OrdinalIgnoreCase) >= 0;
            var isAlphaClip = material.IsKeywordEnabled("_ALPHATEST_ON") ||
                              (material.HasProperty("_AlphaClip") && material.GetFloat("_AlphaClip") > 0.5f);
            var isTransparent = !isAlphaClip && (
                isAdditiveApproximation ||
                material.renderQueue >= 3000 ||
                material.IsKeywordEnabled("_SURFACE_TYPE_TRANSPARENT") ||
                (material.HasProperty("_Surface") && material.GetFloat("_Surface") > 0.5f) ||
                baseColor.a < 0.999f);

            var pbr = new Dictionary<string, object>
            {
                ["baseColorFactor"] = ColorArray(ClampColor(baseColor), true),
                ["metallicFactor"] = Mathf.Clamp01(MaterialFloat(material, "_Metallic", 0f)),
                ["roughnessFactor"] = 1f - Mathf.Clamp01(MaterialFloat(material, "_Smoothness", 0f)),
            };
            if (baseTexture != null)
            {
                pbr["baseColorTexture"] = new Dictionary<string, object>
                {
                    ["index"] = EnsureTexture(baseTexture, isAdditiveApproximation),
                    ["texCoord"] = 0,
                };
            }

            var textureBindings = new List<object>();
            foreach (var propertyName in material.GetTexturePropertyNames().OrderBy(name => name, StringComparer.Ordinal))
            {
                if (!(material.GetTexture(propertyName) is Texture2D texture))
                {
                    continue;
                }

                var textureIdentity = AssetIdentity.For(texture);
                textureBindings.Add(new Dictionary<string, object>
                {
                    ["property"] = propertyName,
                    ["texture"] = EnsureTexture(texture, isAdditiveApproximation),
                    ["unityAssetPath"] = textureIdentity.AssetPath,
                    ["unityGuid"] = textureIdentity.Guid,
                    ["unityFileId"] = textureIdentity.FileIdText,
                });
            }

            var materialDocument = new Dictionary<string, object>
            {
                ["name"] = material.name,
                ["pbrMetallicRoughness"] = pbr,
                ["doubleSided"] = material.HasProperty("_Cull") && material.GetFloat("_Cull") == 0f,
                ["extras"] = new Dictionary<string, object>
                {
                    ["brazeLocalId"] = identity.BrazeLocalId("material"),
                    ["unityAssetPath"] = identity.AssetPath,
                    ["unityGuid"] = identity.Guid,
                    ["unityFileId"] = identity.FileIdText,
                    ["unityShader"] = shaderName,
                    ["unityTextureBindings"] = textureBindings,
                },
            };

            if (isAlphaClip)
            {
                materialDocument["alphaMode"] = "MASK";
                materialDocument["alphaCutoff"] = MaterialFloat(material, "_Cutoff", 0.5f);
            }
            else if (isTransparent)
            {
                materialDocument["alphaMode"] = "BLEND";
            }

            if (isEmissive)
            {
                var strength = Mathf.Max(1f, maxEmission);
                materialDocument["emissiveFactor"] = new[]
                {
                    emissionColor.r / strength,
                    emissionColor.g / strength,
                    emissionColor.b / strength,
                };
                if (emissionTexture != null)
                {
                    materialDocument["emissiveTexture"] = new Dictionary<string, object>
                    {
                        ["index"] = EnsureTexture(emissionTexture, isAdditiveApproximation),
                        ["texCoord"] = 0,
                    };
                }

                if (strength > 1f)
                {
                    extensionsUsed.Add("KHR_materials_emissive_strength");
                    materialDocument["extensions"] = new Dictionary<string, object>
                    {
                        ["KHR_materials_emissive_strength"] = new Dictionary<string, object>
                        {
                            ["emissiveStrength"] = strength,
                        },
                    };
                }
            }

            if (shaderName.IndexOf("TSP_CustomToon", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                diagnostics.Warning(
                    "toon-shader-pbr-approximation",
                    "The custom toon shader was approximated with glTF metallic-roughness PBR. " +
                    "Its atlas is mapped as base color; ramp bindings remain in material extras.",
                    identity.AssetPath);
            }

            if (isAdditiveApproximation ||
                (isTransparent && isEmissive &&
                 (material.IsKeywordEnabled("_ALPHABLEND_ON") || isLightsHint)))
            {
                diagnostics.Warning(
                    "additive-blend-approximated",
                    "Core glTF has no additive blend mode; the material was exported as alpha-blended emissive PBR " +
                    "with PNG alpha derived from RGB luminance.",
                    identity.AssetPath);
            }

            var materialIndex = materials.Count;
            materials.Add(materialDocument);
            materialIndices[material] = materialIndex;
            manifestMaterials.Add(new Dictionary<string, object>
            {
                ["name"] = material.name,
                ["brazeLocalId"] = identity.BrazeLocalId("material"),
                ["source"] = identity.ManifestDocument(),
                ["unityShader"] = shaderName,
                ["alphaMode"] = isAlphaClip ? "MASK" : isTransparent ? "BLEND" : "OPAQUE",
                ["emissive"] = isEmissive,
                ["textureBindings"] = textureBindings,
            });
            return materialIndex;
        }

        private int EnsureTexture(Texture2D texture, bool alphaFromLuminance = false)
        {
            var indexByTexture = alphaFromLuminance
                ? luminanceAlphaTextureIndices
                : textureIndices;
            if (indexByTexture.TryGetValue(texture, out var existing))
            {
                return existing;
            }

            var identity = AssetIdentity.For(texture);
            var textureLocalId = identity.BrazeLocalId("texture") +
                                 (alphaFromLuminance ? ":alpha-luminance" : "");
            byte[] png;
            try
            {
                png = EncodePng(texture, alphaFromLuminance);
            }
            catch (Exception exception)
            {
                diagnostics.Error(
                    "texture-encode-failed",
                    $"Texture could not be converted to embedded PNG: {exception.Message}",
                    identity.AssetPath);
                throw new BrazeExportException("GLB texture export failed.", diagnostics.Items);
            }

            var imageBufferView = AddRawBufferView(png, null);
            var imageIndex = images.Count;
            images.Add(new Dictionary<string, object>
            {
                ["name"] = alphaFromLuminance ? texture.name + "_AlphaFromLuminance" : texture.name,
                ["bufferView"] = imageBufferView,
                ["mimeType"] = "image/png",
                ["extras"] = new Dictionary<string, object>
                {
                    ["brazeLocalId"] = textureLocalId,
                    ["unityAssetPath"] = identity.AssetPath,
                    ["unityGuid"] = identity.Guid,
                    ["unityFileId"] = identity.FileIdText,
                    ["alphaFromLuminance"] = alphaFromLuminance,
                },
            });

            var samplerIndex = samplers.Count;
            samplers.Add(new Dictionary<string, object>
            {
                ["magFilter"] = texture.filterMode == FilterMode.Point ? 9728 : 9729,
                ["minFilter"] = texture.filterMode == FilterMode.Point
                    ? 9984
                    : texture.filterMode == FilterMode.Trilinear ? 9987 : 9985,
                ["wrapS"] = GltfWrap(texture.wrapModeU),
                ["wrapT"] = GltfWrap(texture.wrapModeV),
            });

            var textureIndex = textures.Count;
            textures.Add(new Dictionary<string, object>
            {
                ["name"] = alphaFromLuminance ? texture.name + "_AlphaFromLuminance" : texture.name,
                ["sampler"] = samplerIndex,
                ["source"] = imageIndex,
            });
            indexByTexture[texture] = textureIndex;
            manifestTextures.Add(new Dictionary<string, object>
            {
                ["name"] = texture.name,
                ["brazeLocalId"] = textureLocalId,
                ["source"] = identity.ManifestDocument(),
                ["width"] = texture.width,
                ["height"] = texture.height,
                ["exportedMimeType"] = "image/png",
                ["embedded"] = true,
                ["alphaFromLuminance"] = alphaFromLuminance,
            });
            return textureIndex;
        }

        private void ExportColliderSummary()
        {
            foreach (var collider in root.GetComponentsInChildren<Collider>(true)
                         .OrderBy(item => TransformPath(item.transform), StringComparer.Ordinal))
            {
                var record = new Dictionary<string, object>
                {
                    ["name"] = collider.gameObject.name,
                    ["unityTransformPath"] = TransformPath(collider.transform),
                    ["type"] = collider.GetType().Name,
                    ["enabled"] = collider.enabled,
                    ["isTrigger"] = collider.isTrigger,
                    ["contactOffset"] = collider.contactOffset,
                    ["unityLayer"] = collider.gameObject.layer,
                    ["bounds"] = ColliderBounds(collider),
                    ["geometryEmbedded"] = false,
                };

                if (collider.sharedMaterial != null)
                {
                    record["physicsMaterial"] = AssetIdentity.For(collider.sharedMaterial).ManifestDocument();
                }

                switch (collider)
                {
                    case MeshCollider meshCollider:
                        record["convex"] = meshCollider.convex;
                        record["cookingOptions"] = meshCollider.cookingOptions.ToString();
                        record["mesh"] = meshCollider.sharedMesh == null
                            ? null
                            : AssetIdentity.For(meshCollider.sharedMesh).ManifestDocument();
                        break;
                    case BoxCollider boxCollider:
                        record["center"] = Vector3Array(ToGltfPosition(boxCollider.center));
                        record["size"] = Vector3Array(boxCollider.size);
                        break;
                    case SphereCollider sphereCollider:
                        record["center"] = Vector3Array(ToGltfPosition(sphereCollider.center));
                        record["radius"] = sphereCollider.radius;
                        break;
                    case CapsuleCollider capsuleCollider:
                        record["center"] = Vector3Array(ToGltfPosition(capsuleCollider.center));
                        record["radius"] = capsuleCollider.radius;
                        record["height"] = capsuleCollider.height;
                        record["direction"] = capsuleCollider.direction;
                        break;
                }

                manifestColliders.Add(record);
            }
        }

        private Dictionary<string, object> BuildDocument()
        {
            var document = new Dictionary<string, object>
            {
                ["asset"] = new Dictionary<string, object>
                {
                    ["version"] = "2.0",
                    ["generator"] = "Braze Bridge 0.1.0",
                    ["extras"] = new Dictionary<string, object>
                    {
                        ["brazeBridgeSchemaVersion"] = 1,
                        ["unityPrefabAssetPath"] = prefabAssetPath,
                        ["unityPrefabGuid"] = prefabGuid,
                        ["unityPrefabFileId"] = prefabFileId.ToString(CultureInfo.InvariantCulture),
                        ["coordinateConversion"] = "Unity LH to glTF RH via (x,y,z)->(x,y,-z); geometry baked into prefab-root space",
                    },
                },
                ["scene"] = 0,
                ["scenes"] = new List<object>
                {
                    new Dictionary<string, object>
                    {
                        ["name"] = root.name,
                        ["nodes"] = Enumerable.Range(0, nodes.Count).Cast<object>().ToList(),
                        ["extras"] = new Dictionary<string, object>
                        {
                            ["bounds"] = BoundsDocument(boundsMin, boundsMax),
                        },
                    },
                },
                ["nodes"] = nodes,
                ["meshes"] = meshes,
                ["materials"] = materials,
                ["accessors"] = accessors,
                ["bufferViews"] = bufferViews,
                ["buffers"] = new List<object>
                {
                    new Dictionary<string, object>
                    {
                        ["byteLength"] = (int)binary.Length,
                    },
                },
            };

            if (textures.Count > 0)
            {
                document["images"] = images;
                document["samplers"] = samplers;
                document["textures"] = textures;
            }
            if (extensionsUsed.Count > 0)
            {
                document["extensionsUsed"] = extensionsUsed.OrderBy(item => item, StringComparer.Ordinal).Cast<object>().ToList();
            }
            return document;
        }

        private int AddVector3Accessor(Vector3[] values, bool includeBounds)
        {
            AlignBinary();
            var byteOffset = (int)binary.Position;
            var minimum = new Vector3(float.PositiveInfinity, float.PositiveInfinity, float.PositiveInfinity);
            var maximum = new Vector3(float.NegativeInfinity, float.NegativeInfinity, float.NegativeInfinity);
            foreach (var value in values)
            {
                writer.Write(value.x);
                writer.Write(value.y);
                writer.Write(value.z);
                minimum = Vector3.Min(minimum, value);
                maximum = Vector3.Max(maximum, value);
            }
            var view = AddWrittenBufferView(byteOffset, values.Length * 12, ArrayBufferTarget);
            var accessor = new Dictionary<string, object>
            {
                ["bufferView"] = view,
                ["componentType"] = FloatComponentType,
                ["count"] = values.Length,
                ["type"] = "VEC3",
            };
            if (includeBounds)
            {
                accessor["min"] = Vector3Array(minimum);
                accessor["max"] = Vector3Array(maximum);
            }
            accessors.Add(accessor);
            return accessors.Count - 1;
        }

        private int AddVector4Accessor(Vector4[] values)
        {
            AlignBinary();
            var byteOffset = (int)binary.Position;
            foreach (var value in values)
            {
                writer.Write(value.x);
                writer.Write(value.y);
                writer.Write(value.z);
                writer.Write(value.w);
            }
            var view = AddWrittenBufferView(byteOffset, values.Length * 16, ArrayBufferTarget);
            accessors.Add(new Dictionary<string, object>
            {
                ["bufferView"] = view,
                ["componentType"] = FloatComponentType,
                ["count"] = values.Length,
                ["type"] = "VEC4",
            });
            return accessors.Count - 1;
        }

        private int AddVector2Accessor(Vector2[] values)
        {
            AlignBinary();
            var byteOffset = (int)binary.Position;
            foreach (var value in values)
            {
                writer.Write(value.x);
                writer.Write(value.y);
            }
            var view = AddWrittenBufferView(byteOffset, values.Length * 8, ArrayBufferTarget);
            accessors.Add(new Dictionary<string, object>
            {
                ["bufferView"] = view,
                ["componentType"] = FloatComponentType,
                ["count"] = values.Length,
                ["type"] = "VEC2",
            });
            return accessors.Count - 1;
        }

        private int AddColorAccessor(Color[] values)
        {
            AlignBinary();
            var byteOffset = (int)binary.Position;
            foreach (var value in values)
            {
                writer.Write(value.r);
                writer.Write(value.g);
                writer.Write(value.b);
                writer.Write(value.a);
            }
            var view = AddWrittenBufferView(byteOffset, values.Length * 16, ArrayBufferTarget);
            accessors.Add(new Dictionary<string, object>
            {
                ["bufferView"] = view,
                ["componentType"] = FloatComponentType,
                ["count"] = values.Length,
                ["type"] = "VEC4",
            });
            return accessors.Count - 1;
        }

        private int AddIndexAccessor(int[] values)
        {
            AlignBinary();
            var byteOffset = (int)binary.Position;
            var minimum = int.MaxValue;
            var maximum = 0;
            foreach (var value in values)
            {
                if (value < 0)
                {
                    throw new InvalidOperationException("Mesh indices cannot be negative.");
                }
                writer.Write((uint)value);
                minimum = Math.Min(minimum, value);
                maximum = Math.Max(maximum, value);
            }
            var view = AddWrittenBufferView(byteOffset, values.Length * 4, ElementArrayBufferTarget);
            accessors.Add(new Dictionary<string, object>
            {
                ["bufferView"] = view,
                ["componentType"] = UnsignedIntComponentType,
                ["count"] = values.Length,
                ["type"] = "SCALAR",
                ["min"] = new[] { minimum == int.MaxValue ? 0 : minimum },
                ["max"] = new[] { maximum },
            });
            return accessors.Count - 1;
        }

        private int AddRawBufferView(byte[] bytes, int? target)
        {
            AlignBinary();
            var byteOffset = (int)binary.Position;
            writer.Write(bytes);
            return AddWrittenBufferView(byteOffset, bytes.Length, target);
        }

        private int AddWrittenBufferView(int byteOffset, int byteLength, int? target)
        {
            var document = new Dictionary<string, object>
            {
                ["buffer"] = 0,
                ["byteOffset"] = byteOffset,
                ["byteLength"] = byteLength,
            };
            if (target.HasValue)
            {
                document["target"] = target.Value;
            }
            bufferViews.Add(document);
            return bufferViews.Count - 1;
        }

        private void AlignBinary()
        {
            while (binary.Position % 4 != 0)
            {
                writer.Write((byte)0);
            }
        }

        private byte[] EncodePng(Texture2D source, bool alphaFromLuminance)
        {
            var previous = RenderTexture.active;
            var temporary = RenderTexture.GetTemporary(
                source.width,
                source.height,
                0,
                RenderTextureFormat.ARGB32,
                RenderTextureReadWrite.sRGB);
            Texture2D readable = null;
            try
            {
                Graphics.Blit(source, temporary);
                RenderTexture.active = temporary;
                readable = new Texture2D(source.width, source.height, TextureFormat.RGBA32, false, false);
                readable.ReadPixels(new Rect(0, 0, source.width, source.height), 0, 0, false);
                readable.Apply(false, false);
                if (alphaFromLuminance)
                {
                    var pixels = readable.GetPixels32();
                    for (var index = 0; index < pixels.Length; index += 1)
                    {
                        var pixel = pixels[index];
                        pixel.a = (byte)Math.Max(pixel.r, Math.Max(pixel.g, pixel.b));
                        pixels[index] = pixel;
                    }
                    readable.SetPixels32(pixels);
                    readable.Apply(false, false);
                }
                var png = ImageConversion.EncodeToPNG(readable);
                if (png == null || png.Length == 0)
                {
                    throw new InvalidOperationException("Unity returned an empty PNG payload.");
                }
                return png;
            }
            finally
            {
                if (readable != null)
                {
                    UnityEngine.Object.DestroyImmediate(readable);
                }
                RenderTexture.active = previous;
                RenderTexture.ReleaseTemporary(temporary);
            }
        }

        private Dictionary<string, object> ColliderBounds(Collider collider)
        {
            var source = LocalColliderBounds(collider);
            var toRoot = root.transform.worldToLocalMatrix * collider.transform.localToWorldMatrix;
            var minimum = new Vector3(float.PositiveInfinity, float.PositiveInfinity, float.PositiveInfinity);
            var maximum = new Vector3(float.NegativeInfinity, float.NegativeInfinity, float.NegativeInfinity);
            for (var x = -1; x <= 1; x += 2)
            {
                for (var y = -1; y <= 1; y += 2)
                {
                    for (var z = -1; z <= 1; z += 2)
                    {
                        var local = source.center + Vector3.Scale(source.extents, new Vector3(x, y, z));
                        var rootLocal = toRoot.MultiplyPoint3x4(local);
                        var converted = ToGltfPosition(rootLocal);
                        minimum = Vector3.Min(minimum, converted);
                        maximum = Vector3.Max(maximum, converted);
                    }
                }
            }
            return BoundsDocument(minimum, maximum);
        }

        private static Bounds LocalColliderBounds(Collider collider)
        {
            switch (collider)
            {
                case MeshCollider meshCollider when meshCollider.sharedMesh != null:
                    return meshCollider.sharedMesh.bounds;
                case BoxCollider boxCollider:
                    return new Bounds(boxCollider.center, boxCollider.size);
                case SphereCollider sphereCollider:
                    return new Bounds(
                        sphereCollider.center,
                        Vector3.one * sphereCollider.radius * 2f);
                case CapsuleCollider capsuleCollider:
                    var extents = Vector3.one * capsuleCollider.radius;
                    extents[capsuleCollider.direction] = Mathf.Max(
                        capsuleCollider.radius,
                        capsuleCollider.height * 0.5f);
                    return new Bounds(capsuleCollider.center, extents * 2f);
                default:
                    return new Bounds(Vector3.zero, Vector3.zero);
            }
        }

        private void IncludeBounds(Vector3 minimum, Vector3 maximum)
        {
            if (!hasBounds)
            {
                boundsMin = minimum;
                boundsMax = maximum;
                hasBounds = true;
                return;
            }

            boundsMin = Vector3.Min(boundsMin, minimum);
            boundsMax = Vector3.Max(boundsMax, maximum);
        }

        private string TransformPath(Transform transform)
        {
            var parts = new List<string>();
            var cursor = transform;
            while (cursor != null)
            {
                parts.Add(cursor.name);
                if (cursor == root.transform)
                {
                    break;
                }
                cursor = cursor.parent;
            }
            parts.Reverse();
            return string.Join("/", parts);
        }

        private static Texture2D FirstTexture(Material material, params string[] propertyNames)
        {
            foreach (var propertyName in propertyNames)
            {
                if (material.HasProperty(propertyName) && material.GetTexture(propertyName) is Texture2D texture)
                {
                    return texture;
                }
            }
            return null;
        }

        private static Color MaterialColor(
            Material material,
            string primary,
            string fallback,
            Color defaultValue)
        {
            if (!string.IsNullOrEmpty(primary) && material.HasProperty(primary))
            {
                return material.GetColor(primary);
            }
            if (!string.IsNullOrEmpty(fallback) && material.HasProperty(fallback))
            {
                return material.GetColor(fallback);
            }
            return defaultValue;
        }

        private static float MaterialFloat(Material material, string propertyName, float defaultValue)
        {
            return material.HasProperty(propertyName) ? material.GetFloat(propertyName) : defaultValue;
        }

        private static int GltfWrap(TextureWrapMode mode)
        {
            switch (mode)
            {
                case TextureWrapMode.Repeat: return 10497;
                case TextureWrapMode.Mirror: return 33648;
                case TextureWrapMode.Clamp: return 33071;
                default: return 33071;
            }
        }

        private static Vector3 ToGltfPosition(Vector3 value)
        {
            return new Vector3(value.x, value.y, -value.z);
        }

        private static Vector3 ToGltfDirection(Vector3 value)
        {
            return new Vector3(value.x, value.y, -value.z);
        }

        private static float[] Vector3Array(Vector3 value)
        {
            return new[] { value.x, value.y, value.z };
        }

        private static float[] ColorArray(Color color, bool alpha)
        {
            return alpha
                ? new[] { color.r, color.g, color.b, color.a }
                : new[] { color.r, color.g, color.b };
        }

        private static Color ClampColor(Color color)
        {
            return new Color(
                Mathf.Clamp01(color.r),
                Mathf.Clamp01(color.g),
                Mathf.Clamp01(color.b),
                Mathf.Clamp01(color.a));
        }

        private static Dictionary<string, object> BoundsDocument(Vector3 minimum, Vector3 maximum)
        {
            var size = maximum - minimum;
            var center = (minimum + maximum) * 0.5f;
            return new Dictionary<string, object>
            {
                ["min"] = Vector3Array(minimum),
                ["max"] = Vector3Array(maximum),
                ["center"] = Vector3Array(center),
                ["size"] = Vector3Array(size),
            };
        }

        private static byte[] BuildGlb(string json, byte[] binaryPayload)
        {
            var jsonBytes = Encoding.UTF8.GetBytes(json);
            var paddedJsonLength = Align4(jsonBytes.Length);
            var paddedBinaryLength = Align4(binaryPayload.Length);
            var totalLength = 12 + 8 + paddedJsonLength + 8 + paddedBinaryLength;

            using (var output = new MemoryStream(totalLength))
            using (var glbWriter = new BinaryWriter(output, Encoding.UTF8, true))
            {
                glbWriter.Write(0x46546C67u);
                glbWriter.Write(2u);
                glbWriter.Write((uint)totalLength);

                glbWriter.Write((uint)paddedJsonLength);
                glbWriter.Write(0x4E4F534Au);
                glbWriter.Write(jsonBytes);
                for (var index = jsonBytes.Length; index < paddedJsonLength; index += 1)
                {
                    glbWriter.Write((byte)0x20);
                }

                glbWriter.Write((uint)paddedBinaryLength);
                glbWriter.Write(0x004E4942u);
                glbWriter.Write(binaryPayload);
                for (var index = binaryPayload.Length; index < paddedBinaryLength; index += 1)
                {
                    glbWriter.Write((byte)0);
                }

                glbWriter.Flush();
                return output.ToArray();
            }
        }

        private static int Align4(int value)
        {
            return (value + 3) & ~3;
        }

        private static string Sha256(byte[] value)
        {
            using (var algorithm = SHA256.Create())
            {
                var hash = algorithm.ComputeHash(value);
                var output = new StringBuilder(hash.Length * 2);
                foreach (var item in hash)
                {
                    output.Append(item.ToString("x2"));
                }
                return output.ToString();
            }
        }

        private readonly struct AssetIdentity
        {
            public readonly string AssetPath;
            public readonly string Guid;
            public readonly long FileId;
            public string FileIdText => FileId.ToString(CultureInfo.InvariantCulture);

            private AssetIdentity(string assetPath, string guid, long fileId)
            {
                AssetPath = assetPath;
                Guid = guid;
                FileId = fileId;
            }

            public static AssetIdentity For(UnityEngine.Object asset)
            {
                if (asset == null)
                {
                    return new AssetIdentity("", "", 0);
                }

                var path = AssetDatabase.GetAssetPath(asset) ?? "";
                AssetDatabase.TryGetGUIDAndLocalFileIdentifier(asset, out var guid, out long fileId);
                return new AssetIdentity(path, guid ?? "", fileId);
            }

            public string BrazeLocalId(string kind)
            {
                return $"{kind}:{Guid}:{FileIdText}";
            }

            public Dictionary<string, object> ManifestDocument()
            {
                return new Dictionary<string, object>
                {
                    ["assetPath"] = AssetPath,
                    ["guid"] = Guid,
                    ["fileId"] = FileIdText,
                };
            }
        }
    }
}
