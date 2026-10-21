# Braze Bridge

`com.braze.bridge` is a Unity 6 Editor package for exporting a selected static
prefab to a self-contained glTF 2.0 binary (`.glb`) plus a Braze bridge
manifest. It is intentionally independent of third-party glTF packages.

The bridge supports static prefabs composed of `MeshFilter`/`MeshRenderer`
objects, external Unity materials and textures, and mesh colliders.

## Install as a local package

In Unity, choose **Window > Package Management > Package Manager**, click the
`+` menu, and choose **Install package from disk**. Select this package's
`package.json`.

For a stable local development path, the Unity project's
`Packages/manifest.json` can instead contain:

```json
{
  "dependencies": {
    "com.braze.bridge": "file:/absolute/path/to/braze-engine/tools/unity/com.braze.bridge"
  }
}
```

The package contains only exporter code. Keep Unity source assets in your own
project and check their licenses before redistributing exported content.

## Editor menu

Select a `.prefab` in Unity's Project window, then choose:

**Assets > Export to Braze > Selected Static Prefab as GLB...**

The exporter writes `<name>.glb` and `<name>.braze-export.json`. Saving over an
existing destination is treated as an explicit re-export.

When the destination is under your project's `assets/`, register the completed
export from the engine repository root. Set `BRAZE_PROJECT_ROOT` to that project
so the asset database can create stable metadata and the editable Braze prefab:

```sh
BRAZE_PROJECT_ROOT=/absolute/path/to/my-game npm run unity:register -- --manifest /absolute/path/to/Shop.braze-export.json
```

## Batch CLI

Use Unity's `-executeMethod` entry point. Keep a graphics device available;
do not add `-nographics` when non-readable or PSD textures require the
RenderTexture conversion path.

```sh
/path/to/Unity \
  -batchmode \
  -quit \
  -projectPath "/path/to/unity-project" \
  -executeMethod Braze.Bridge.Editor.BrazeBridgeCli.Export \
  -brazePrefab "Assets/Prefabs/Shop.prefab" \
  -brazeOutput "/path/to/my-game/assets/Shop.glb" \
  -brazeOverwrite
```

Arguments:

- `-brazePrefab <Assets/...prefab>` is required.
- `-brazeOutput <file.glb>` is required. Relative paths resolve from the Unity
  project root.
- `-brazeManifest <file.json>` is optional. The default is
  `<output>.braze-export.json`.
- `-brazeOverwrite` permits replacing stable re-export destinations.
- `-brazeFailOnWarning` converts adapter warnings into an export failure.

## Already-open Editor request seam

The Editor package polls this generated request path about once per second:

```text
Library/BrazeBridge/export-request.json
```

Publish the request atomically by writing a temporary file in the same
directory and renaming it to `export-request.json`:

```json
{
  "requestId": "shop-v1",
  "prefabPath": "Assets/Prefabs/Shop.prefab",
  "outputPath": "/path/to/my-game/assets/Shop.glb",
  "failOnWarning": false
}
```

`outputPath` and the optional `manifestPath` may be absolute or relative to the
Unity project root. A watcher request is an explicit re-export, so it replaces
an existing destination. The watcher atomically claims and removes the request,
runs only while the Editor is neither compiling, importing, nor entering Play
Mode, and atomically publishes:

```text
Library/BrazeBridge/export-result.json
```

The result contains `success`, `requestId`, output paths, the source prefab
Unity GUID, GLB SHA-256, and structured diagnostics. On failure it also contains
an `error` object. `Library/BrazeBridge` is generated local state and should not
be committed. A `export-request.processing-*.json` file left by an Editor crash
is not retried automatically; submit a new request after inspecting it.

## Export contract

For each supported `MeshFilter` the bridge:

1. loads the prefab through `PrefabUtility.LoadPrefabContents`;
2. bakes vertices, normals, and tangents into prefab-root space;
3. converts Unity's left-handed coordinates to glTF right-handed coordinates
   by reflecting Z and correcting triangle winding;
4. emits a named identity-transform glTF node and mesh, preserving names such
   as `Shop`, `Shop_Door`, and
   `Shop_Lights`;
5. exports UV0 and vertex colours when present;
6. resolves the materials actually assigned by the prefab; and
7. converts every assigned `Texture2D`, including non-readable PSD imports, to
   an embedded PNG through a temporary RenderTexture/readable copy.

The core material adapter maps:

- opaque Unity atlas materials to glTF metallic-roughness PBR;
- transparent URP materials to `alphaMode: BLEND`, retaining material alpha;
- alpha-clipped materials to `alphaMode: MASK`; and
- emissive materials to glTF emission, using
  `KHR_materials_emissive_strength` for HDR emission values.

Custom toon-ramp and additive-blending semantics have no exact core-glTF
equivalent. The atlas is used as PBR base colour, additive light geometry is
approximated as alpha-blended emission with alpha derived from RGB luminance,
and all original texture-property
bindings—including the toon ramp—remain embedded and listed in material
`extras` and in the manifest.

Stable provenance is included in glTF `extras` and the manifest:

```text
brazeLocalId: mesh:<unity-guid>:<fileID>
unityAssetPath
unityGuid
unityFileId
unityPrefabAssetPath
unityPrefabGuid
unityTransformPath
```

Equivalent `material:...`, `texture:...`, and `primitive:...` local IDs are
emitted for subassets. The manifest also includes root/model bounds, per-node
bounds, collider bounds and source mesh identity, diagnostics, output hash, and
serializes Unity fileIDs as decimal strings so JavaScript cannot truncate
64-bit identifiers. It also carries
the recommended Braze importer settings:

```json
{
  "scaleFactor": 1,
  "convertUnits": true,
  "sourceUnit": "meter",
  "fitToEditorSize": false,
  "importMaterials": true,
  "importAnimations": false,
  "generateColliders": false
}
```

Collider geometry is not rendered or embedded in this slice. The manifest
records supported `MeshCollider`, `BoxCollider`, `SphereCollider`, and
`CapsuleCollider` properties, root-space bounds, and mesh GUID/fileID so the
Braze importer can resolve or build collision separately.

## Deliberate first-slice limits

The exporter reports errors instead of silently dropping unsupported content.
It currently rejects:

- nested prefab dependencies;
- `SkinnedMeshRenderer`, blend shapes, animation, Animator, scripts, lights,
  particle systems, LOD groups, constraints, and rigid bodies;
- inactive GameObjects and disabled renderers;
- non-triangle mesh topology;
- runtime/generated meshes, materials, or textures without stable Unity
  GUID/fileID identity;
- repeated use of one mesh asset at multiple baked transforms; and
- cubemaps, render textures, and other non-`Texture2D` material inputs.

The current PBR adapter only connects base-colour and emission textures.
Additional texture bindings are preserved but are not connected as glTF
normal, occlusion, or metallic-roughness channels. Mesh compression,
quantization, animation, skins, nested-prefab reconstruction, and collider
geometry export are intentionally deferred.
