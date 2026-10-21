import {
  createBrowserThreeWebGpuRenderSession,
  type BrowserThreeWebGpuRenderSession,
  type BrowserThreeWebGpuSessionOptions,
} from "../adapters/browser-three-webgpu-session";

export type BrowserRenderSessionOwner = Readonly<{
  acquire: (options?: BrowserThreeWebGpuSessionOptions) => Promise<BrowserThreeWebGpuRenderSession>;
}>;

export type BrowserRenderSessionOwnerDependencies = Readonly<{
  createSession: typeof createBrowserThreeWebGpuRenderSession;
}>;

const DEFAULT_DEPENDENCIES: BrowserRenderSessionOwnerDependencies = {
  createSession: createBrowserThreeWebGpuRenderSession,
};

/**
 * Serializes app-level WebGPU ownership across startup generations.
 * A successor cannot request its device until its predecessor's native device is destroyed.
 */
export function createBrowserRenderSessionOwner(
  dependencies: BrowserRenderSessionOwnerDependencies = DEFAULT_DEPENDENCIES,
): BrowserRenderSessionOwner {
  let ownershipTail = Promise.resolve();

  return Object.freeze({
    acquire: async (options = {}) => {
      const predecessor = ownershipTail;
      let releaseTurn = () => undefined;
      const ownedTurn = new Promise<void>((resolve) => {
        let released = false;
        releaseTurn = () => {
          if (released) return;
          released = true;
          resolve();
        };
      });
      ownershipTail = predecessor.then(() => ownedTurn);

      try {
        await waitForOwnership(predecessor, options.signal);
        options.signal?.throwIfAborted();
        let rendererFailureRequested = false;
        let requestOwnerDisposal: (() => Promise<void>) | null = null;
        const session = await dependencies.createSession({
          ...options,
          onRendererFailure: (diagnostic) => {
            rendererFailureRequested = true;
            const pending = requestOwnerDisposal?.();
            if (pending) void pending.catch((error: unknown) => reportOwnerError(options, error));
            try { options.onRendererFailure?.(diagnostic); } catch (error) {
              reportOwnerError(options, error);
            }
          },
        });
        if (options.signal?.aborted) {
          try {
            await session.disposeAsync();
          } catch (error) {
            reportOwnerError(options, error);
          }
          options.signal.throwIfAborted();
        }

        let disposal: Promise<void> | null = null;
        const disposeAsync = (): Promise<void> => {
          if (disposal) return disposal;
          disposal = (async () => {
            try {
              await session.disposeAsync();
            } finally {
              options.signal?.removeEventListener("abort", onAbort);
              releaseTurn();
            }
          })();
          return disposal;
        };
        const onAbort = () => {
          void disposeAsync().catch((error: unknown) => reportOwnerError(options, error));
        };
        options.signal?.addEventListener("abort", onAbort, { once: true });
        requestOwnerDisposal = disposeAsync;
        if (rendererFailureRequested) {
          void disposeAsync().catch((error: unknown) => reportOwnerError(options, error));
        }

        const ready = session.ready.catch(async (error) => {
          try {
            await disposeAsync();
          } catch (disposalError) {
            reportOwnerError(options, disposalError);
          }
          throw error;
        });

        return {
          ...session,
          ready,
          dispose: () => {
            void disposeAsync().catch((error: unknown) => reportOwnerError(options, error));
          },
          disposeAsync,
        };
      } catch (error) {
        releaseTurn();
        throw error;
      }
    },
  });
}

const SHARED_OWNER_SLOT = "__brazeBrowserRenderSessionOwnerV1__";
type SharedOwnerHost = typeof globalThis & Partial<Record<typeof SHARED_OWNER_SLOT, BrowserRenderSessionOwner>>;

/** Survives entry-module HMR so replacement startup cannot overlap the previous GPU device. */
export function sharedBrowserRenderSessionOwner(): BrowserRenderSessionOwner {
  const host = globalThis as SharedOwnerHost;
  const current = host[SHARED_OWNER_SLOT];
  if (current) return current;
  const owner = createBrowserRenderSessionOwner();
  host[SHARED_OWNER_SLOT] = owner;
  return owner;
}

async function waitForOwnership(predecessor: Promise<void>, signal?: AbortSignal): Promise<void> {
  if (!signal) {
    await predecessor;
    return;
  }
  signal.throwIfAborted();
  let rejectAbort: (reason?: unknown) => void = () => undefined;
  const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
  const onAbort = () => { rejectAbort(signal.reason); };
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    await Promise.race([predecessor, aborted]);
    signal.throwIfAborted();
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

function reportOwnerError(options: BrowserThreeWebGpuSessionOptions, error: unknown): void {
  try { options.onError?.(error); } catch { /* Ownership release cannot be interrupted by observers. */ }
}
