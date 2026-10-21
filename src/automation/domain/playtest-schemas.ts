import { enumeration, identifier, object } from "./command-schemas";

const duration = (maximum: number) => ({ type: "integer", minimum: 0, maximum });
const unit = { type: "number", minimum: 0, maximum: 1 };
export const browserStepsSchema = { type: "array", minItems: 1, maxItems: 32, items: { oneOf: [
  object({ kind: { const: "focus" } }, ["kind"]),
  object({ kind: { const: "wait" }, durationMs: duration(1000) }, ["kind", "durationMs"]),
  object({ kind: { const: "key" }, key: { type: "string", pattern: "^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Space|Enter|Escape|Tab|Backspace|ShiftLeft|ShiftRight)$" }, durationMs: duration(2000) }, ["kind", "key"]),
  object({ kind: { const: "pointer" }, action: enumeration("move", "click"), x: { ...unit, description: "Normalized horizontal position within visible Game bounds: 0 left, 1 right." }, y: { ...unit, description: "Normalized vertical position within visible Game bounds: 0 top, 1 bottom." } }, ["kind", "action", "x", "y"]),
  object({ kind: { const: "ui" }, action: enumeration("click", "check", "uncheck", "focus"), screenId: identifier, nodeId: { type: "string", minLength: 1, maxLength: 64 } }, ["kind", "action", "screenId", "nodeId"]),
  object({ kind: { const: "ui" }, action: { const: "fill" }, screenId: identifier, nodeId: { type: "string", minLength: 1, maxLength: 64 }, value: { type: "string", maxLength: 4096 } }, ["kind", "action", "screenId", "nodeId", "value"]),
] } };
