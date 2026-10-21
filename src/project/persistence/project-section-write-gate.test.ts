import { describe, expect, it } from "vitest";
import { createProjectSectionWriteGate } from "./project-section-write-gate";

describe("project section write gate", () => {
  it("stays closed after a failed or still-pending canonical load", () => {
    const gate = createProjectSectionWriteGate<{ names: string[] }>();

    expect(gate.needsPersistence({ names: ["browser recovery"] })).toBe(false);
  });

  it("does not write an unchanged hydrated section", () => {
    const gate = createProjectSectionWriteGate<{ names: string[] }>();
    gate.acceptCanonicalBase({ names: ["canonical"] });

    expect(gate.needsPersistence({ names: ["canonical"] })).toBe(false);
  });

  it("persists an early local edit after it is merged over the canonical base", () => {
    const gate = createProjectSectionWriteGate<{ names: string[] }>();
    gate.acceptCanonicalBase({ names: ["canonical"] });

    expect(gate.needsPersistence({ names: ["canonical", "early local edit"] })).toBe(true);

    gate.acceptCanonicalBase({ names: ["canonical", "early local edit"] });
    expect(gate.needsPersistence({ names: ["canonical", "early local edit"] })).toBe(false);
  });
});
