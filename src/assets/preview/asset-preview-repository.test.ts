import { describe, expect, it, vi } from "vitest";
import type { AssetPreviewDescriptor } from "./asset-preview-source";
import { AssetPreviewRepository } from "./asset-preview-repository";

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const SHOP: AssetPreviewDescriptor = {
  kind: "model",
  url: "/3d-models/Shop.glb",
  revision: "source-r1",
};

describe("AssetPreviewRepository", () => {
  it("deduplicates concurrent requests and publishes a stable snapshot", async () => {
    const result = deferred<string | null>();
    const render = vi.fn(() => result.promise);
    const repository = new AssetPreviewRepository({ render, dispose: vi.fn() });
    const changed = vi.fn();
    repository.subscribe(SHOP, changed);

    repository.request(SHOP);
    repository.request(SHOP);

    expect(render).toHaveBeenCalledTimes(1);
    expect(repository.read(SHOP)).toEqual({ status: "loading", url: null });

    result.resolve("blob:shop");
    await result.promise;
    await Promise.resolve();

    expect(repository.read(SHOP)).toEqual({ status: "ready", url: "blob:shop" });
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it("disposes a stale result and only publishes the refreshed generation", async () => {
    const first = deferred<string | null>();
    const second = deferred<string | null>();
    const render = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const dispose = vi.fn();
    const repository = new AssetPreviewRepository({ render, dispose });
    repository.subscribe(SHOP, vi.fn());
    repository.request(SHOP);

    repository.refresh("model", SHOP.url, "import-r2");
    expect(render).toHaveBeenCalledTimes(2);
    expect(render.mock.calls[1][0]).toEqual({ ...SHOP, revision: "import-r2" });

    first.resolve("blob:stale");
    await first.promise;
    await Promise.resolve();
    expect(dispose).toHaveBeenCalledWith("blob:stale");
    expect(repository.read(SHOP).status).toBe("loading");

    second.resolve("blob:fresh");
    await second.promise;
    await Promise.resolve();
    expect(repository.read(SHOP)).toEqual({ status: "ready", url: "blob:fresh" });
  });

  it("bounds unobserved previews and disposes URLs as they are evicted", async () => {
    const dispose = vi.fn();
    const repository = new AssetPreviewRepository({
      maxRetained: 1,
      render: async (descriptor) => `blob:${descriptor.url}`,
      dispose,
    });
    const other = { ...SHOP, url: "/3d-models/Door.glb" };

    repository.request(SHOP);
    await Promise.resolve();
    await Promise.resolve();
    repository.request(other);
    await Promise.resolve();
    await Promise.resolve();

    expect(dispose).toHaveBeenCalledWith(`blob:${SHOP.url}`);
    expect(repository.read(other)).toEqual({ status: "ready", url: `blob:${other.url}` });
  });

  it("disposes a pending result that arrives after the repository is cleared", async () => {
    const result = deferred<string | null>();
    const dispose = vi.fn();
    const repository = new AssetPreviewRepository({ render: () => result.promise, dispose });
    repository.request(SHOP);

    repository.clear();
    result.resolve("blob:late");
    await result.promise;
    await Promise.resolve();

    expect(dispose).toHaveBeenCalledWith("blob:late");
    expect(repository.read(SHOP)).toEqual({ status: "idle", url: null });
  });

  it("cancels queued work after its final observer leaves", () => {
    const render = vi.fn((_descriptor: AssetPreviewDescriptor, signal: AbortSignal) =>
      new Promise<string | null>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      }));
    const repository = new AssetPreviewRepository({ render, dispose: vi.fn() });
    const unsubscribe = repository.subscribe(SHOP, vi.fn());
    repository.request(SHOP);

    const signal = render.mock.calls[0][1];
    expect(signal.aborted).toBe(false);
    unsubscribe();

    expect(signal.aborted).toBe(true);
    expect(repository.read(SHOP)).toEqual({ status: "idle", url: null });
  });
});
