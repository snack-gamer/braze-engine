export const meshFilterSchema = {
  type: "object", additionalProperties: false, required: ["mesh"], properties: { mesh: {
    description: "Mesh source. null clears geometry without changing transforms, materials or colliders. Imported references must identify a static mesh subasset from assets.list, not a whole model.",
    anyOf: [{ type: "null" }, { type: "object", additionalProperties: false, required: ["kind", "primitive"], properties: {
      kind: { const: "builtin" }, primitive: { enum: ["cube", "sphere", "plane"] } } },
    { type: "object", additionalProperties: false, required: ["kind", "asset"], properties: { kind: { const: "asset" }, asset: {
      type: "object", additionalProperties: false, required: ["guid", "localId"], properties: {
        guid: { type: "string", pattern: "^[a-fA-F0-9]{32}$" }, localId: { type: "string", minLength: 1, maxLength: 256 } } } } }],
  } },
};
