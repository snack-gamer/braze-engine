# Device-scheduled reflection probe integration

The reflection session lane owns the controller, its cube render target, and one transferred
device-task lane. It does not own a clock, animation loop, render surface, or GPU queue lease.

Create it with a dedicated named lane from the shared device render session:

```ts
const probeLane = renderSession.registerDeviceTaskLane("reflection-probe");
const reflectionProbe = createThreeReflectionProbeSessionLane({
  lane: probeLane,
  events: {
    onCaptureCompleted: ({ generation, texture }) => {
      publishEnvironmentTexture(generation, texture);
      requestViewportFrame();
    },
    onError: reportReflectionProbeError,
  },
});
```

Pass the current `DeviceRenderOpportunity` from the viewport frame coordinator to
`reflectionProbe.flush(opportunity)`. The opportunity must come from
`renderSession.opportunityForFrame(...)`. The device-task lane shares the session's fair queue
governor and telemetry, invokes `(renderer) => void` only after device admission, and keeps that
callback synchronous. The bridge allocates no canvas target. Do not invoke capture callbacks
directly from a React effect or outside render-session ownership.

Call `reflectionProbe.invalidate({ scene, position })` when probe content becomes stale. This only
coalesces authored invalidation into local pending work; it does not submit GPU work. On the next
coordinator frame, `flush(opportunity)` offers the retained callback to the lane. A queued callback
is offered once and remains owned by that lane until execution. A rejected callback stays local and
is retried by a later `flush`. Later invalidations replace the controller's scene and copied position
without enqueuing duplicate lane work.

The bridge clears the active callback immediately before synchronous execution. An invalidation
that arrives during capture can therefore install one follow-up callback, which is flushed on a
later coordinator opportunity. Capture failure is reported through `onError` and re-establishes the
controller's pending admission without claiming a new texture generation.

A successful texture is published through `onCaptureCompleted` only after `getGeneration()`
advances and all six faces have been synchronously recorded. The event's generation is not a claim
that GPU work has retired. The integration requests another viewport frame from this event so later
submitted scene work observes the newly recorded texture in device-queue order.

The bridge takes ownership of the passed lane. Call only `reflectionProbe.dispose()`; it disposes
the controller before the lane and is idempotent. A queued stale callback becomes a no-op. Disposal
during capture is deferred until the synchronous `CubeCamera.update()` call returns. The capture
target uses only public Three APIs and restores the previous render target, cube face, mip level,
XR flag, and mipmap-generation setting even when a face render throws.
