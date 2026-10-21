# Three r184 atmosphere integration contract

This folder is the live Three adapter for low-resolution clouds and godrays. The immutable
`ViewportRenderGraphPackage` is the structural source of truth; Three's `RenderPipeline` evaluates
the matching node dependencies. Adapter-owned render targets are the physical realization of the
graph's logical atmosphere transients and live only as long as that immutable post topology.

## Live topology

| Effect | Physical work | Graph contract | Format |
| --- | --- | --- | --- |
| Clouds | one quarter-linear contribution pass; full-resolution composite masks it with scene depth | `clouds` | RGBA16F |
| Godrays | one half-linear R8 source-mask pass, then one half-linear R16F radial integration; full-resolution additive composite | `godrays-source-mask` → `godrays` | R8 + R16F |
| Shadows | none | no atmosphere pass reads a shadow resource | forbidden dependency |

The source pass accepts bright samples only where scene depth identifies clear sky. Geometry
therefore occludes the light source without a shadow map, and bright foreground materials cannot
become false shaft emitters. The radial pass samples that compact scalar mask instead of fetching
full-resolution color and depth at every raymarch step. The result relies on stable linear
upsampling; there is no generic bilateral stage, hidden RGBA depth packing, or blur-target pair.

## Three 0.184.0 public-API boundary

- `three/webgpu` publicly exports `RenderTarget`, `NodeMaterial`, `QuadMesh`, `RedFormat`, and
  `HalfFloatType`; these are sufficient for the owned contribution targets and fullscreen passes.
- `RendererUtils.saveRendererState`, `resetRendererState`, and `restoreRendererState` bracket every
  nested contribution pass in `try/finally`.
- `examples/jsm/tsl/display/GodraysNode.js` requires a complete light-shadow setup and privately owns
  its render target/material, so it is not used.
- `BilateralBlurNode` privately owns two additional RGBA targets and performs horizontal and vertical
  kernels. It is not part of the live godray topology.
- `TRAANode` and `TAAUNode` own private whole-image history; neither is used as atmosphere storage.

Do not patch private Three fields, bind a cascade/light shadow to atmosphere, add an independent
queue submission, or represent a hidden implementation pass in the compiled graph.

## Execution and lifetime rules

1. `ViewportRenderPipeline` rebuilds only when an effect crosses its active boundary. Changes within
   an active topology update uniforms.
2. The base scene uses the cloud-free sky material. `cloudsLayer()` runs only in the quarter-linear
   contribution material.
3. Atmosphere targets resize only after the renderer drawing-buffer extent changes and otherwise
   remain resident for the topology lifetime.
4. Cloud composition samples full-resolution scene depth and writes cloud color only for clear-sky
   pixels, preventing low-resolution samples from covering geometry.
5. The godray source pass reads scene color/depth once per half-resolution pixel into R8. The radial
   pass reads only that mask plus camera/view and hierarchy-light data into an R16F contribution.
6. The graph has no speculative temporal flags, velocity target, or history store. A future temporal
   implementation must arrive as one complete executable feature, not dormant topology.
7. Disposing the immutable post topology disposes both atmosphere targets and materials.

The graph tests lock the live pass count, extents, formats, and shadow-free dependency set.
