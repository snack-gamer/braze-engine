# Three r184 aggregate GPU timing integration

The controller measures GPU render duration through Three's public timestamp API. It does not own
an animation loop, timer, renderer, telemetry store, or GPU device. It owns the device task lane
passed to it and releases that lane on `dispose()`.

## What the number means

`Renderer.resolveTimestampsAsync("render")` returns Three's aggregate render timestamp result in
milliseconds. Three r184 allocates timestamp pairs per render context, resolves all currently
pending render queries, and returns the aggregate selected by its frame grouping. The public
renderer API does not expose query UIDs or a one-query-to-session-submission mapping. With a shared
renderer and multiple surfaces, this is therefore an **aggregate Three render window**, not an
exclusive cost for one surface, graph pass, presented frame, or queue epoch.

Samples use the pass id `three-render-aggregate-window`. Keep that label in diagnostics. Do not
rename it to `frame GPU time`, `presentation time`, or a specific effect/pass. The associated
submission is the latest real render submission known when resolution begins: it is the window's
upper-bound anchor, not a claim that the duration belongs exclusively to that submission. Through
the telemetry store, that submission still resolves back to the actual RAF opportunity that caused
it.

Three's WebGPU timestamp pool returns `undefined` before it has a value. It may also retain its last
value internally after a backend resolve failure; no public freshness token is exposed. The
controller reports undefined/invalid results as unavailable and reports rejected promises, but it
cannot manufacture stronger freshness guarantees than the public API provides.

## Why the asynchronous call is session-owned

In the pinned Three 0.184.0 implementation, an initialized renderer's
`resolveTimestampsAsync("render")` call reaches `WebGPUTimestampQueryPool._resolveQueries()`
synchronously before its first `await`. The query resolve/copy command encoder and
`device.queue.submit(...)` therefore happen while the admitted device-task callback is still on the
stack. Only `mapAsync` completion and telemetry publication happen later. Async completion submits
no GPU work and never publishes CPU elapsed time as GPU time.

Do not `await` or return the promise from the host callback; host callbacks remain synchronous. Do
not call `resolveTimestampsAsync` from a React effect, timeout, HUD update, or an independent RAF.
If a future Three version moves command submission past an asynchronous boundary, this contract
must be re-audited before upgrading.

## Session wiring

The browser adapter keeps capability separate from policy. Normal editor/player sessions do not
request `timestamp-query` and set no `trackTimestamp` work. Only the explicit `?gpuTiming=1`
diagnostic opt-in requests the adapter feature; if it is supported, the resulting enabled flag is
passed into the shared session as `gpuTimingEnabled`. That policy flag is the sole source for the
renderer option and the one `aggregate-gpu-timing` device lane/controller.

Admission exposes its existing `DeviceRenderTimingIdentities` and `FrameTelemetryStore` through
`gpuTimingTelemetryAccess()`. The controller uses those narrow references; it never constructs a
second identity source or telemetry store. Admission observes only lanes registered as render
surfaces. After the governor has minted and recorded a surface submission, it forwards the exact
`RenderSubmissionId`, original `RafOpportunityId`, and governor-recorded submission timestamp.
Timing, reflection, preview, and other device-task lanes have no observer and cannot become sample
anchors.

`opportunityForFrame(...)` calls `flush(opportunity)` once after recording each new RAF
opportunity. Reusing the same engine frame index returns the existing opportunity without another
flush. A retained result is a normal `GpuPassTelemetry` sample in the session store, so diagnostics
and the HUD need no second stats cache or clock.

The default 500 ms interval is based on accepted render-submission timestamps, not wall-clock
polling. Only one map can be in flight. A backed-up task lane is re-offered at most once per interval
and older callbacks are invalidated, so pending resolution is latest-wins and bounded. If the
feature is unsupported, construct it with `lane: null`; `flush()` remains an inert `unsupported`
result. Rejections and promise failures are contained and can be forwarded to the session's
diagnostic observer.

The asynchronous disposal path first quiesces admission, waits for any active synchronous encoder
to return and submit its work, and only then takes the final queue fence. It also waits for the
active timestamp mapping before releasing renderer/device ownership. Re-entrant disposal, a stale
queued callback, and a late `mapAsync` completion therefore cannot race resource teardown.
