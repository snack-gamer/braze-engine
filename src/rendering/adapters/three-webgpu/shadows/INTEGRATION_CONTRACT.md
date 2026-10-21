# Three r184 cascade-shadow integration contract

This adapter intentionally uses only Three.js r184 public surfaces.

Evidence inspected from the installed 0.184.0 package:

- `node_modules/three/src/lights/LightShadow.js`: public scheduling flags and map-size control.
- `node_modules/three/src/nodes/lighting/ShadowNode.js`: internal target allocation in `setupRenderTarget()` and the `needsUpdate || autoUpdate` gate in `updateBefore()`.
- `node_modules/three/examples/jsm/csm/CSMShadowNode.js`: public cascade-light array and `updateFrustums()`, plus private `_init` and `_shadowNodes` ownership.
- `node_modules/@types/three/examples/jsm/csm/CSMShadowNode.d.ts`: the supported addon surface mirrored by `ThreeCsmPublicSurface`.

- `LightShadow.autoUpdate`, `needsUpdate`, and `mapSize` are the supported scheduling and sizing controls.
- `CSMShadowNode.lights`, `camera`, `mode`, `maxFar`, `customSplitsCallback`, and `updateFrustums()` are public in the shipped addon declarations.
- `ShadowNode.setupRenderTarget()` allocates the render target and depth texture internally. The graph therefore describes those cascade depths as persistent, externally owned history resources rather than pretending the generic transient pool owns them.
- `ShadowNode.updateShadow()` replaces a default-only shadow-camera layer mask with the view camera mask. The binding therefore requires disjoint, non-default static and dynamic caster masks; near/mid cameras receive both masks while the far camera receives only the static mask.
- `CSMShadowNode` creates its cascade lights and shadow nodes during private `_init()`. Until `camera` and all three public lights exist, applying a frame plan returns `awaiting-three-initialization` without mutation.
- `ThreeSizedCsmNode.setup()` calls the public superclass setup, then sizes the public cascade
  lights from the engine's quality policy before the returned shader graph allocates textures.
  Resizing after the first draw destroyed depth textures still referenced by r184's cached GPU
  bindings. This keeps the first allocation at its final size without accessing private nodes.
- Once lazy CSM initialization completes, the viewport invalidates receiving material shaders
  once so they bind the completed graph. Physics pose-view restoration also invalidates receiver
  materials after retiring its temporary graph. Without these lifetime invalidations, the live
  editor retained dark cached surfaces after scene switches or Stop; marking the receiving
  materials dirty restored correct lighting. This performs no per-frame scene traversal.
- r184 keys shadow `RenderObject` caches against the light's persistent shadow override
  material, rather than the mesh's source material. Restoring/disposal of a GPU pose
  source material therefore leaves a cached shadow shader bound to its old storage
  attributes. Cold pose bind/restore and runtime draw-group detachment use the public
  `TSL.disposeShadowMaterial()` for the base light and public CSM cascade lights, retiring
  those render bindings before pose buffers can be destroyed. The CSM node, cascade
  depth textures and receiver shader graph keep their identities; caster generations
  request a fresh draw. Pose revisions never reset these materials.
- `CSMShadowNode.updateBefore()` snaps its public cascade-light positions after the engine's authored
  camera-generation plan has run. The session invokes that public update once before rendering,
  compares the resulting public light positions with the previous frame, and sets only a moved
  cascade's public `shadow.needsUpdate`. A snapped cascade camera can therefore never move while its
  old depth map remains visible, which removes the former stop-motion shadow cadence.
- The addon keeps `_shadowNodes` private. This adapter does not replace `setupRenderTarget()`, invoke `updateShadow()`, set `depthLayer`, or inspect any private field. It attaches the official node through Three r184's supported `light.shadow.shadowNode` runtime slot behind one narrowly typed adapter boundary.

The live viewport owns one CSM session per directional light. It assigns authored and generated casters to layers 30/29 while preserving visible layer 0, lets Three perform lazy initialization, and retains the initial generation plan until all three public cascade lights exist. Moving graph ownership into engine-managed textures still requires an engine-owned `ShadowBaseNode` implementation or a supported Three render-target injection API; it must not be implemented by patching r184 internals.
