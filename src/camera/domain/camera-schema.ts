/** Public authoring schema; camera-settings owns semantic validation. */
export const cameraSettingsSchema = {
  type: "object", additionalProperties: false,
  description: "Camera-object settings, merged with the existing camera. Metres and degrees. Far must exceed near. Game projection is independent of Scene navigation.",
  properties: {
    target: { type: "array", items: { type: "number" }, minItems: 3, maxItems: 3 },
    projection: { type: "string", enum: ["perspective", "orthographic"], default: "perspective" },
    fov: { type: "number", minimum: 1, maximum: 179, default: 52 },
    fovAxis: { type: "string", enum: ["vertical", "horizontal"], default: "vertical" },
    orthographicSize: { type: "number", minimum: 0.001, maximum: 1000000, default: 5, description: "Half the vertical view height, in metres." },
    near: { type: "number", minimum: 0.001, maximum: 1000000, default: 0.1 },
    far: { type: "number", minimum: 0.002, maximum: 10000000, default: 200 },
    cullingMask: { type: "integer", minimum: 0, maximum: 4294967295, default: 4294967295, description: "Unsigned mask over all 32 project object layers; 0 renders no objects." },
    background: { type: "string", enum: ["environment", "solid"], default: "environment" },
    backgroundColor: { type: "string", pattern: "^#[0-9a-fA-F]{6}$", default: "#20242b" },
  },
};
