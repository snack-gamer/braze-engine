import { describe, expect, it } from "vitest";
import { fitAndStripWarnings } from "./assets";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("asset warning filter", () => {
  it("restores console.warn after overlapping loads finish out of order", async () => {
    const original = console.warn;
    const first = deferred<void>();
    const second = deferred<void>();

    const firstWork = fitAndStripWarnings(() => first.promise);
    const installedFilter = console.warn;
    const secondWork = fitAndStripWarnings(() => second.promise);

    expect(installedFilter).not.toBe(original);
    expect(console.warn).toBe(installedFilter);

    first.resolve();
    await firstWork;
    expect(console.warn).toBe(installedFilter);

    second.resolve();
    await secondWork;
    expect(console.warn).toBe(original);
  });

  it("restores console.warn when work throws before returning a promise", async () => {
    const original = console.warn;
    await expect(fitAndStripWarnings(() => {
      throw new Error("load failed synchronously");
    })).rejects.toThrow("load failed synchronously");
    expect(console.warn).toBe(original);
  });
});
