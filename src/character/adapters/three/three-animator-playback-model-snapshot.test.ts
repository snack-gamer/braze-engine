import { describe, expect, it } from "vitest";
import { selectedPlaybackModelGuids } from "./three-animator-playback-model-snapshot";

describe("Three Animator playback model snapshot", () => {
  it("prioritizes 32 target models while retaining the full 256-source clip budget", () => {
    const targets = new Set(Array.from({ length: 40 }, (_, index) => (
      `1${index.toString(16).padStart(31, "0")}`
    )));
    const external = new Set(Array.from({ length: 300 }, (_, index) => (
      `2${index.toString(16).padStart(31, "0")}`
    )));

    const selected = selectedPlaybackModelGuids({ targets, external });

    expect(selected).toHaveLength(288);
    expect(selected.filter((guid) => guid.startsWith("1"))).toHaveLength(32);
    expect(selected.filter((guid) => guid.startsWith("2"))).toHaveLength(256);
  });
});
