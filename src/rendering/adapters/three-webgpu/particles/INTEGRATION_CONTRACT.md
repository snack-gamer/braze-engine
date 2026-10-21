# Particle rendering boundary

Braze currently vendors `@particles/gpu` and pins `three@0.184.0` plus
`@types/three@0.184.1`. Particle simulation and rendering remain GPU-resident.

## Why there is no public cutover in Three r184

The installed APIs were inspected at their implementation boundaries:

- `vendor/particles/packages/gpu/src/effect-view.ts`, `ParticleEffectView.render()`, requires a live
  `GPURenderPassEncoder`, camera, and target state.
- `vendor/particles/packages/gpu/src/backend.ts`, `ParticleBackend.setPassTargetState()` and
  `render()`, build raw WebGPU pipelines for the complete ordered MRT formats, depth format, and
  sample count, then issue indirect draws into that same pass.
- `node_modules/three/src/renderers/common/Renderer.js`, `render()`, calls
  `backend.beginRender()`, renders its private object lists, and calls `backend.finishRender()`.
  It returns a render context only after the pass has ended.
- The public `Renderer.setRenderObjectFunction()` callback receives objects, geometry, materials,
  lights, clipping, and pass ID. It does not receive a pass encoder or attachment metadata.
- `Renderer.getContext()` exposes the canvas context, not Three's active scene-depth attachment.
- `node_modules/three/src/renderers/webgpu/WebGPUBackend.js` stores the encoder in backend render
  context data as `currentPass`; `WebGPUUtils` derives the actual color/depth/sample layout.
  Both modules mark these details private, as does `_currentRenderContext` in `@types/three`.

A second public canvas pass is not equivalent: it cannot load Three's private scene depth or join
its MRT pass, so particles would become an unoccluded overlay. A Three-native TSL implementation is
also not a wrapper: it requires porting the vendored raw WGSL storage, compaction, indirect draw,
sprite, and mesh contracts. That is a separate particle-backend rewrite.

## Live compatibility boundary

`three-r184-particle-base-pass-bridge.ts` is the only module allowed to inspect the pinned private
shape. It installs one late Three render object and injects particle draws only for the viewport's
primary camera while Three's depth-aware base pass is open. It forwards every MRT format, the depth
format, and sample count, then invalidates Three's cached WebGPU pipeline bindings.

The bridge verifies the exact Three revision and required backend methods at installation. It also
validates the live pass, attachment values, and `currentSets` shape before recording. A mismatch
emits one structured `THREE_R184_PARTICLE_PASS_INCOMPATIBLE` diagnostic and disables the hook.
Installation-contract mismatches fail setup immediately; live mismatches let Three close its active
pass before the diagnostic crosses the boundary. The bridge never silently drops particles or
probes for an alternative private layout.

The typed viewport graph therefore annotates particles as `basePassCompatibility` on `base-scene`.
It does not claim an independently owned particle pass or allocate a fictitious color target.

Particle compute ticks occur only inside an admitted viewport submission in
`viewport-frame-coordinator.ts`. Its pre-admission `isActive()` check reads immutable authored state
only. GPU reconciliation (`syncGpuForAdmittedRender()`), view construction/replacement, transform
upload work, `tickGpuForAdmittedRender()`, and bridge activation happen after the surface accepts
the submission. Device
acquisition is an immediate read from the already-ready shared render session; a missing device
retries through normal admitted viewport sync and creates no RAF, timer, renderer, or queue owner.

Custom particle images use a split decode/commit boundary. Fetch, blob conversion, and
`createImageBitmap()` may complete asynchronously, but completion can only place the latest desired
bitmap in a CPU-side staging store bounded to the latest renderable URLs (primary maps, atlas, and
the four supported mesh batches) and request a normal viewport frame. It cannot receive a GPU
device. `ParticleViewport.syncGpuForAdmittedRender()` is the single commit owner: after surface
admission it creates the texture, copies the bitmap, evicts superseded textures, and rebuilds the
bind group before the base pass renders. Paused/static viewports therefore replace the placeholder
on the requested frame without introducing another clock. Superseded fetches are aborted, stale
decoded bitmaps are closed, and disposal prevents late results from repopulating GPU state.

The admitted steady-state path owns reusable camera, effector, collider, mesh-slot, indirect-argument,
and render-option storage. Multi-emitter effects capture the camera once, and mesh bind groups are
rebuilt only when their layout or texture changes. Authored emitter membership is reconciled through
the explicit `refreshEmitters()`, `refreshEffectors()`, and `refreshColliders()` edit operations; a
simulation tick does not allocate reconciliation sets or walk helper-object descendants. Immutable
scene-array identity likewise keeps the pre-admission activity check constant-time between edits.

## Public future seam and removal condition

`particle-graph-pass-adapter.ts` remains a tested future seam. It can be used only when the caller
publicly owns an open pass plus its color/depth/sample contract. It is intentionally not wired to
Three r184.

Delete the compatibility bridge when one of these is implemented:

1. the executable viewport graph publicly owns the base color/depth pass and supplies it to the
   graph-pass adapter;
2. particles are ported to a Three-native storage/indirect render object; or
3. Three exposes an official external-command callback containing the live pass and attachments.

Do not replace it with backend casts elsewhere, `getCurrentTexture()` overlays, CPU readback, a
second renderer, or a particle-specific render clock.
