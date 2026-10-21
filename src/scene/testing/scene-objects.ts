import { seedObjects as engineDefaults } from "../../constants";
import { makeObject } from "../../lib/payload";

/** Representative primitive shapes for authoring tests, outside editor defaults. */
export const seedObjects = [
  ...engineDefaults,
  makeObject("plane", 2),
  makeObject("cube", 3),
  makeObject("sphere", 4),
];
