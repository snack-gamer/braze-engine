import type { PrimitiveKind } from "../domain/scene-values";

export const SCENE_DOCUMENT_VERSION = "braze-engine/scene-v1" as const;
export const LEGACY_SCENE_DOCUMENT_VERSIONS = ["braze-engine/scene-v0"] as const;

export const SUPPORTED_SCENE_PRIMITIVES: readonly PrimitiveKind[] = [
  "cube",
  "transform",
  "sphere",
  "plane",
  "water",
  "cloner",
  "effector",
  "particle",
  "image",
  "fbx",
  "usdz",
  "usd",
  "gltf",
  "camera",
  "directionalLight",
];

export type SceneDocumentV1 = {
  version: typeof SCENE_DOCUMENT_VERSION;
  name?: string;
  lightingAuthoringVersion?: number;
  savedAt?: string;
  objects: unknown[];
  camera?: unknown;
  activeObjectId?: string | null;
  activeCameraId?: string | null;
  environment?: unknown;
  physics?: unknown;
  timeline?: unknown;
  animation?: unknown;
  [key: string]: unknown;
};

export type SceneDocumentErrorCode =
  | "invalid-root"
  | "invalid-version"
  | "unsupported-version"
  | "invalid-objects"
  | "invalid-object"
  | "unsupported-primitive"
  | "duplicate-object-id"
  | "invalid-field"
  | "invalid-json";

/** Controlled load failure suitable for display in the editor save-status UI. */
export class SceneDocumentError extends Error {
  readonly code: SceneDocumentErrorCode;
  readonly path?: string;

  constructor(code: SceneDocumentErrorCode, message: string, path?: string) {
    super(message);
    this.name = "SceneDocumentError";
    this.code = code;
    this.path = path;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isLegacyVersion(version: string): boolean {
  return (LEGACY_SCENE_DOCUMENT_VERSIONS as readonly string[]).includes(version);
}

function validateObjectRecords(objects: unknown[]): void {
  const ids = new Set<string>();
  objects.forEach((object, index) => {
    const path = `objects[${index}]`;
    if (!isRecord(object)) {
      throw new SceneDocumentError(
        "invalid-object",
        `Saved scene ${path} must be an object.`,
        path,
      );
    }

    const sourceType = object.source_type;
    if (
      sourceType !== undefined
      && (!SUPPORTED_SCENE_PRIMITIVES.includes(sourceType as PrimitiveKind))
    ) {
      throw new SceneDocumentError(
        "unsupported-primitive",
        `Saved scene ${path}.source_type contains unsupported primitive ${JSON.stringify(sourceType)}.`,
        `${path}.source_type`,
      );
    }

    if (object.id !== undefined && (typeof object.id !== "string" || object.id.length === 0)) {
      throw new SceneDocumentError(
        "invalid-field",
        `Saved scene ${path}.id must be a non-empty string when present.`,
        `${path}.id`,
      );
    }
    if (typeof object.id !== "string") return;
    if (ids.has(object.id)) {
      throw new SceneDocumentError(
        "duplicate-object-id",
        `Saved scene contains duplicate object id ${JSON.stringify(object.id)}.`,
        `${path}.id`,
      );
    }
    ids.add(object.id);
  });
}

function validateOptionalField(
  input: Record<string, unknown>,
  key: string,
  accepts: (value: unknown) => boolean,
  expectation: string,
): void {
  if (input[key] === undefined || accepts(input[key])) return;
  throw new SceneDocumentError(
    "invalid-field",
    `Saved scene ${key} must be ${expectation} when present.`,
    key,
  );
}

/**
 * Validates the wire envelope and deterministically upgrades supported legacy
 * documents. The migration never mutates its input and is idempotent.
 */
export function migrateSceneDocument(input: unknown): SceneDocumentV1 {
  if (!isRecord(input)) {
    throw new SceneDocumentError("invalid-root", "Saved scene must be a JSON object.");
  }

  const version = input.version;
  if (version !== undefined && typeof version !== "string") {
    throw new SceneDocumentError(
      "invalid-version",
      "Saved scene version must be a string when present.",
      "version",
    );
  }
  if (
    typeof version === "string"
    && version !== SCENE_DOCUMENT_VERSION
    && !isLegacyVersion(version)
  ) {
    throw new SceneDocumentError(
      "unsupported-version",
      `Unsupported scene version ${JSON.stringify(version)}. This editor supports ${SCENE_DOCUMENT_VERSION}.`,
      "version",
    );
  }
  if (!Array.isArray(input.objects)) {
    throw new SceneDocumentError(
      "invalid-objects",
      "Saved scene must contain an objects array.",
      "objects",
    );
  }

  validateOptionalField(
    input,
    "lightingAuthoringVersion",
    (value) => typeof value === "number" && Number.isFinite(value),
    "a finite number",
  );
  validateOptionalField(input, "name", (value) => typeof value === "string" && value.trim().length > 0 && value.trim().length <= 128 && !/[\u0000-\u001f]/.test(value), "a nonempty scene name of at most 128 characters");
  validateOptionalField(input, "savedAt", (value) => typeof value === "string", "a string");
  for (const key of ["activeObjectId", "activeCameraId"]) {
    validateOptionalField(
      input,
      key,
      (value) => value === null || typeof value === "string",
      "a string or null",
    );
  }

  validateObjectRecords(input.objects);
  return {
    ...input,
    version: SCENE_DOCUMENT_VERSION,
    objects: input.objects.map((object) => ({ ...(object as Record<string, unknown>) })),
  };
}
