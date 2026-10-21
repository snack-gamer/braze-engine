import { describe, expect, it, vi } from "vitest";
import { DeviceRenderTimingIdentities } from "../telemetry/render-timing-identities";
import { GpuQueueEpochGovernor, type GpuQueueEpochLease } from "./gpu-queue-epoch-governor";

function deferred() {
  let resolve!: () => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<void>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function admittedLease(result: ReturnType<GpuQueueEpochGovernor["offerRenderAttempt"]>): GpuQueueEpochLease {
  if (result.disposition !== "admitted") throw new Error("Expected an admitted render attempt.");
  return result.lease;
}

async function flushCompletion(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("GpuQueueEpochGovernor", () => {
  it("bounds active epochs and coalesces pressure to the newest render attempt", async () => {
    const completions: ReturnType<typeof deferred>[] = [];
    const retired = vi.fn();
    const discarded = vi.fn();
    const ids = new DeviceRenderTimingIdentities("queue-device");
    const governor = new GpuQueueEpochGovernor(
      {
        onSubmittedWorkDone: () => {
          const completion = deferred();
          completions.push(completion);
          return completion.promise;
        },
      },
      ids,
      {
        maxEpochsInFlight: 1,
        clockMilliseconds: () => 10,
        events: {
          onEpochRetired: retired,
          onPendingAttemptDiscarded: discarded,
        },
      },
    );
    const firstAttempt = ids.nextRenderAttempt();
    const firstLease = admittedLease(governor.offerRenderAttempt(firstAttempt));
    firstLease.submit(ids.nextRenderSubmission());
    expect(governor.epochsInFlight).toBe(1);

    const secondAttempt = ids.nextRenderAttempt();
    expect(governor.offerRenderAttempt(secondAttempt)).toEqual({
      disposition: "pending",
      supersededPendingAttemptId: null,
    });
    const latestAttempt = ids.nextRenderAttempt();
    expect(governor.offerRenderAttempt(latestAttempt)).toEqual({
      disposition: "pending",
      supersededPendingAttemptId: secondAttempt,
    });
    expect(discarded).toHaveBeenCalledWith(secondAttempt, "superseded");
    expect(governor.pendingRenderAttemptId).toBe(latestAttempt);

    completions[0].resolve();
    await flushCompletion();
    expect(governor.epochsInFlight).toBe(0);
    expect(retired).toHaveBeenCalledOnce();

    const latestLease = governor.takePendingRenderAttempt();
    expect(latestLease?.attemptId).toBe(latestAttempt);
    expect(governor.pendingRenderAttemptId).toBeNull();
    expect(governor.epochsInFlight).toBe(1);
    latestLease?.cancel();
    expect(governor.epochsInFlight).toBe(0);
  });

  it("never reserves more than the configured queue epoch bound", async () => {
    const completions: ReturnType<typeof deferred>[] = [];
    const ids = new DeviceRenderTimingIdentities("bounded-queue");
    const governor = new GpuQueueEpochGovernor(
      {
        onSubmittedWorkDone: () => {
          const completion = deferred();
          completions.push(completion);
          return completion.promise;
        },
      },
      ids,
      { maxEpochsInFlight: 2 },
    );
    const first = admittedLease(governor.offerRenderAttempt(ids.nextRenderAttempt()));
    const second = admittedLease(governor.offerRenderAttempt(ids.nextRenderAttempt()));
    first.submit(ids.nextRenderSubmission());
    second.submit(ids.nextRenderSubmission());
    expect(governor.epochsInFlight).toBe(2);

    const pendingAttempt = ids.nextRenderAttempt();
    expect(governor.offerRenderAttempt(pendingAttempt).disposition).toBe("pending");
    expect(governor.takePendingRenderAttempt()).toBeNull();

    completions[0].resolve();
    await flushCompletion();
    const admittedPending = governor.takePendingRenderAttempt();
    expect(admittedPending?.attemptId).toBe(pendingAttempt);
    expect(governor.epochsInFlight).toBe(2);
    admittedPending?.cancel();
    completions[1].resolve();
    await flushCompletion();
    expect(governor.epochsInFlight).toBe(0);
  });

  it("disposes pending and active ownership while ignoring stale queue completion", async () => {
    const completion = deferred();
    const retired = vi.fn();
    const abandoned = vi.fn();
    const discarded = vi.fn();
    const ids = new DeviceRenderTimingIdentities("disposed-queue");
    const governor = new GpuQueueEpochGovernor(
      { onSubmittedWorkDone: () => completion.promise },
      ids,
      {
        maxEpochsInFlight: 1,
        events: {
          onEpochRetired: retired,
          onEpochAbandoned: abandoned,
          onPendingAttemptDiscarded: discarded,
        },
      },
    );
    const lease = admittedLease(governor.offerRenderAttempt(ids.nextRenderAttempt()));
    lease.submit(ids.nextRenderSubmission());
    const pendingAttempt = ids.nextRenderAttempt();
    governor.offerRenderAttempt(pendingAttempt);

    governor.dispose();
    expect(governor.epochsInFlight).toBe(0);
    expect(governor.pendingRenderAttemptId).toBeNull();
    expect(abandoned).toHaveBeenCalledWith(expect.objectContaining({ reason: "disposed" }));
    expect(discarded).toHaveBeenCalledWith(pendingAttempt, "disposed");
    expect(() => lease.cancel()).toThrow(/stale or disposed/);
    expect(governor.offerRenderAttempt(ids.nextRenderAttempt())).toEqual({
      disposition: "rejected",
      reason: "disposed",
    });

    completion.resolve();
    await flushCompletion();
    expect(retired).not.toHaveBeenCalled();
  });

  it("releases a failed retirement fence without leaking an epoch", async () => {
    const completion = deferred();
    const retired = vi.fn();
    const ids = new DeviceRenderTimingIdentities("failed-queue");
    const governor = new GpuQueueEpochGovernor(
      { onSubmittedWorkDone: () => completion.promise },
      ids,
      { events: { onEpochRetired: retired } },
    );
    const lease = admittedLease(governor.offerRenderAttempt(ids.nextRenderAttempt()));
    lease.submit(ids.nextRenderSubmission());
    completion.reject(new Error("device lost"));
    await flushCompletion();

    expect(governor.epochsInFlight).toBe(0);
    expect(retired).toHaveBeenCalledWith(expect.objectContaining({ completion: "failed" }));
  });
});
