export type AnimatorFloatParameter = {
  id: string;
  name: string;
  kind: "float";
  defaultValue: number;
};

export type AnimatorIntegerParameter = {
  id: string;
  name: string;
  kind: "integer";
  defaultValue: number;
};

export type AnimatorBooleanParameter = {
  id: string;
  name: string;
  kind: "boolean";
  defaultValue: boolean;
};

export type AnimatorTriggerParameter = {
  id: string;
  name: string;
  kind: "trigger";
  defaultValue: false;
};

export type AnimatorParameter =
  | AnimatorFloatParameter
  | AnimatorIntegerParameter
  | AnimatorBooleanParameter
  | AnimatorTriggerParameter;

export type AnimatorCondition =
  | { parameterId: string; mode: "if" | "ifNot" | "triggered" }
  | { parameterId: string; mode: "greater" | "less" | "equals" | "notEqual"; threshold: number };

export type AnimatorParameterOverride = {
  parameterId: string;
  value: number | boolean;
};
