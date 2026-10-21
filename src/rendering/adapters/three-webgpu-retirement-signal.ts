import type { ThreeWebGpuSubmissionContext } from "./three-webgpu-render-host";

export type ThreeWebGpuRetirementStatus = "completed" | "failed" | "cancelled";

export type ThreeWebGpuRetirementSignal = Readonly<{
  context: ThreeWebGpuSubmissionContext;
  settle: (status: ThreeWebGpuRetirementStatus) => void;
}>;

/** Bridges the governor's post-callback queue fence into an admitted callback. */
export function createThreeWebGpuRetirementSignal(): ThreeWebGpuRetirementSignal {
  let settled = false;
  let resolve!: (status: ThreeWebGpuRetirementStatus) => void;
  const retirement = new Promise<ThreeWebGpuRetirementStatus>((nextResolve) => {
    resolve = nextResolve;
  });
  return Object.freeze({
    context: Object.freeze({ retirement }),
    settle: (status) => {
      if (settled) return;
      settled = true;
      resolve(status);
    },
  });
}
