import {
  createThreeWebGpuRenderHost,
  type ThreeWebGpuRenderSurface,
} from "./three-webgpu-render-host";
import { ThreeWebGpuSessionAdmission } from "./three-webgpu-session-admission";
import type { ThreeWebGpuSessionAdmissionLane } from "./three-webgpu-session-admission-contract";
import {
  createThreeAggregateGpuTimingController,
  type ThreeAggregateGpuTimingController,
} from "./three-webgpu/telemetry/three-aggregate-gpu-timing-controller";
import type {
  DeviceRenderOpportunity,
  ThreeWebGpuRenderSession,
  ThreeWebGpuRenderSessionDependencies,
  ThreeWebGpuRenderSessionOptions,
} from "./three-webgpu-render-session-contract";

type SurfaceRecord = {
  name: string;
  hostSurface: ThreeWebGpuRenderSurface;
  lane: ThreeWebGpuSessionAdmissionLane;
  disposed: boolean;
};

const DEFAULT_DEPENDENCIES: ThreeWebGpuRenderSessionDependencies = {
  createRenderHost: createThreeWebGpuRenderHost,
  createGpuTimingController: createThreeAggregateGpuTimingController,
};

const GPU_TIMING_LANE_NAME = "aggregate-gpu-timing";

/** Owns one renderer and shared device admission timeline for surfaces and device tasks. */
export function createThreeWebGpuRenderSession(
  options: ThreeWebGpuRenderSessionOptions,
  dependencies: ThreeWebGpuRenderSessionDependencies = DEFAULT_DEPENDENCIES,
): ThreeWebGpuRenderSession {
  const clock = options.clockMilliseconds ?? (() => performance.now());
  const surfaces = new Map<string, SurfaceRecord>();
  let admission: ThreeWebGpuSessionAdmission | null = null;
  let disposed = false;
  let gpuTiming: ThreeAggregateGpuTimingController | null = null;
  let gracefulDisposal: Promise<void> | null = null;
  let lastFrameIndex: number | null = null;
  let lastFrameOpportunity: DeviceRenderOpportunity | null = null;

  const reportCleanupError = (error: unknown) => {
    try { options.onError?.(error); } catch { /* Teardown observers are contained. */ }
  };
  let deviceLossRequested = false;
  let resolveDeviceLoss!: () => void;
  const deviceLoss = new Promise<void>((resolve) => { resolveDeviceLoss = resolve; });
  let requestDisposal: (() => Promise<void>) | null = null;

  const renderHost = dependencies.createRenderHost({
    rendererOptions: {
      ...options.rendererOptions,
      device: options.device,
      trackTimestamp: options.gpuTimingEnabled,
    },
    onFailure: (diagnostic) => {
      if (diagnostic.kind === "device-lost") {
        if (!deviceLossRequested) {
          deviceLossRequested = true;
          resolveDeviceLoss();
        }
        const disposal = requestDisposal?.();
        if (disposal) void disposal.catch(reportCleanupError);
      } else {
        admission?.discardPending();
      }
      try { options.onRendererFailure?.(diagnostic); } catch (error) {
        reportCleanupError(error);
      }
    },
    onError: options.onError,
  });

  function releaseSurface(record: SurfaceRecord): void {
    if (record.disposed) return;
    record.disposed = true;
    if (surfaces.get(record.name) === record) surfaces.delete(record.name);
    try { record.lane.dispose(); } catch (error) { reportCleanupError(error); }
    try { record.hostSurface.dispose(); } catch (error) { reportCleanupError(error); }
  }

  function disposeHostOwnership(): void {
    for (const record of surfaces.values()) releaseSurface(record);
    try { renderHost.dispose(); } catch (error) { reportCleanupError(error); }
  }

  try {
    admission = new ThreeWebGpuSessionAdmission({
      deviceScopeId: options.deviceScopeId,
      device: options.device,
      rendererAvailable: () => renderHost.getStatus() === "ready",
      onOwnershipDispose: disposeHostOwnership,
      telemetry: options.telemetry,
      maxEpochsInFlight: options.maxEpochsInFlight,
      clockMilliseconds: clock,
      onError: options.onError,
    });
  } catch (error) {
    renderHost.dispose();
    throw error;
  }

  const deviceAdmission = admission;

  const finishDisposal = () => {
    gpuTiming = null;
    deviceAdmission.releaseOwnership();
  };

  const beginGracefulDisposal = (): Promise<void> => {
    if (gracefulDisposal) return gracefulDisposal;
    disposed = true;
    const timing = gpuTiming;
    let timingSettlement: Promise<void> | null = null;
    try { timingSettlement = timing?.whenSettled() ?? null; } catch (error) {
      reportCleanupError(error);
    }
    try { timing?.dispose(); } catch (error) { reportCleanupError(error); }
    deviceAdmission.quiesce();
    gracefulDisposal = deviceAdmission.whenSubmissionIdle().then(async () => {
      if (!deviceLossRequested) {
        const waits: Promise<unknown>[] = [];
        try {
          waits.push(options.device.queue.onSubmittedWorkDone());
        } catch (error) {
          waits.push(Promise.reject(error));
        }
        if (timingSettlement) waits.push(timingSettlement);
        const retirement = Promise.allSettled(waits).then((results) => {
          if (deviceLossRequested) return;
          for (const result of results) {
            if (result.status === "rejected") reportCleanupError(result.reason);
          }
        });
        await Promise.race([retirement, deviceLoss]);
      }
      finishDisposal();
    });
    return gracefulDisposal;
  };

  if (options.gpuTimingEnabled) {
    const lane = deviceAdmission.registerLane(
      GPU_TIMING_LANE_NAME,
      (submission, context) => renderHost.execute(submission, context),
    );
    try {
      const access = deviceAdmission.gpuTimingTelemetryAccess();
      gpuTiming = (dependencies.createGpuTimingController ?? createThreeAggregateGpuTimingController)({
        timestampQuerySupported: true,
        lane,
        identities: access.identities,
        telemetry: access.telemetry,
        onError: options.onError,
      });
    } catch (error) {
      lane.dispose();
      deviceAdmission.dispose();
      throw error;
    }
  }

  requestDisposal = beginGracefulDisposal;
  if (deviceLossRequested) void beginGracefulDisposal().catch(reportCleanupError);

  return {
    ready: renderHost.ready,
    retireResources: () => deviceAdmission.whenSubmissionIdle().then(() => {
      if (deviceLossRequested) throw new Error("Cannot retire reusable resources after device loss.");
      return options.device.queue.onSubmittedWorkDone();
    }),
    getStatus: () => disposed ? "disposed" : renderHost.getStatus(),
    opportunityForFrame: (frameIndex, timestampMilliseconds) => {
      if (disposed) throw new Error("Cannot record a RAF opportunity on a disposed render session.");
      validateFrameOpportunity(frameIndex, timestampMilliseconds, lastFrameIndex);
      if (frameIndex === lastFrameIndex) return lastFrameOpportunity!;
      renderHost.beginDeviceFrame();
      const opportunityId = deviceAdmission.recordOpportunity(timestampMilliseconds);
      gpuTiming?.flush(opportunityId);
      lastFrameIndex = frameIndex;
      lastFrameOpportunity = opportunityId;
      return opportunityId;
    },
    registerSurface: (name, canvas) => {
      if (disposed) throw new Error("Cannot register a surface on a disposed render session.");
      const normalizedName = normalizeName(name, "render surface");
      if (surfaces.has(normalizedName)) {
        throw new Error(`Render surface '${normalizedName}' already exists.`);
      }
      const hostSurface = renderHost.registerSurface(canvas);
      let lane: ThreeWebGpuSessionAdmissionLane;
      try {
        lane = deviceAdmission.registerLane(
          normalizedName,
          (submission, context) => hostSurface.render(submission, context),
          gpuTiming?.observeSubmission ?? null,
        );
      } catch (error) {
        hostSurface.dispose();
        throw error;
      }
      const record: SurfaceRecord = { name: normalizedName, hostSurface, lane, disposed: false };
      surfaces.set(normalizedName, record);
      return {
        name: normalizedName,
        configure: (configuration) => (
          !record.disposed && !disposed && record.hostSurface.configure(configuration)
        ),
        request: (opportunity, submission) => (
          record.disposed || disposed
            ? "rejected"
            : record.lane.request(opportunity, submission)
        ),
        resize: (size) => !record.disposed && !disposed && record.hostSurface.resize(size),
        dispose: () => releaseSurface(record),
      };
    },
    registerDeviceTaskLane: (name) => {
      if (disposed) throw new Error("Cannot register a device task lane on a disposed render session.");
      return deviceAdmission.registerLane(
        normalizeName(name, "device task lane"),
        (submission, context) => renderHost.execute(submission, context),
      );
    },
    diagnostics: () => deviceAdmission.diagnostics(),
    summarize: () => deviceAdmission.summarize(),
    dispose: () => {
      void beginGracefulDisposal().catch(reportCleanupError);
    },
    disposeAsync: beginGracefulDisposal,
  };
}

function normalizeName(name: string, label: string): string {
  const normalizedName = name.trim();
  if (normalizedName.length === 0) throw new Error(`A ${label} requires a name.`);
  return normalizedName;
}

function validateFrameOpportunity(
  frameIndex: number,
  timestampMilliseconds: number,
  lastFrameIndex: number | null,
): void {
  if (!Number.isSafeInteger(frameIndex) || frameIndex < 0) {
    throw new Error("A device frame index must be a non-negative safe integer.");
  }
  if (!Number.isFinite(timestampMilliseconds) || timestampMilliseconds < 0) {
    throw new Error("A device frame timestamp must be finite and non-negative.");
  }
  if (lastFrameIndex !== null && frameIndex < lastFrameIndex) {
    throw new Error(`Device frame ${frameIndex} is older than frame ${lastFrameIndex}.`);
  }
}
