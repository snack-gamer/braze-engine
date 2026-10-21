import assert from "node:assert/strict";
import test from "node:test";
import { validateProjectUpdateRequest } from "./project.mjs";

test("project writes require revision tokens for every authored section", () => {
  assert.throws(
    () => validateProjectUpdateRequest({ materials: [] }),
    /Expected body/,
  );
  assert.throws(
    () => validateProjectUpdateRequest({ patch: { materials: [] }, expectedSectionRevisions: {} }),
    /Missing expected revision.*materials/,
  );
  assert.throws(
    () => validateProjectUpdateRequest({
      patch: { materials: [] },
      expectedSectionRevisions: { materials: 42 },
    }),
    /string or null/,
  );

  assert.deepEqual(validateProjectUpdateRequest({
    patch: { materials: [], assets: {} },
    expectedSectionRevisions: { materials: null, assets: "assets-r1" },
  }).expectedSectionRevisions, { materials: null, assets: "assets-r1" });
});
