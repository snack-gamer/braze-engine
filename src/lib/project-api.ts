import type { Material } from "../types";
import { projectPersistenceStore } from "../project/persistence/project-persistence-store";
import { mergeProjectSection } from "../project/persistence/project-section-merge";

export type ProjectFile = {
  version?: string;
  materials?: Material[];
  assets?: {
    folders?: string[];
    itemFolders?: Record<string, string>;
    itemNames?: Record<string, string>;
  };
  /** Versioned project-authored Animator Controller and Avatar Mask library. */
  characterAssets?: unknown;
  updatedAt?: string;
  [key: string]: unknown;
};

export type ProjectDocument = {
  project: ProjectFile;
  revision: string | null;
  sectionRevisions: Record<string, string>;
};

type ProjectApiResponse = {
  status: string;
  message?: string;
  project?: ProjectFile;
  revision?: string | null;
  sectionRevisions?: Record<string, string>;
  section?: string;
  actualRevision?: string | null;
};

export class ProjectSectionConflictError extends Error {
  readonly section: string;
  readonly actualRevision: string | null;
  readonly conflictPaths: readonly string[];

  constructor(
    message: string,
    section: string,
    actualRevision: string | null,
    conflictPaths: readonly string[] = [],
  ) {
    super(message);
    this.name = "ProjectSectionConflictError";
    this.section = section;
    this.actualRevision = actualRevision;
    this.conflictPaths = conflictPaths;
  }
}

const knownSectionRevisions = new Map<string, string | null>();
const knownSectionValues = new Map<string, unknown>();
const unresolvedSectionConflicts = new Map<string, readonly string[]>();
const sectionSaveQueues = new Map<string, Promise<unknown>>();
type SectionQueueContext = {
  baseKnown: boolean;
  baseRevision: string | null;
  baseValue: unknown;
  externalValue: unknown;
};
const sectionQueueContexts = new Map<string, SectionQueueContext>();

function rememberProjectSections(project: ProjectFile, revisions: Record<string, string>): void {
  knownSectionRevisions.clear();
  knownSectionValues.clear();
  for (const [section, revision] of Object.entries(revisions)) {
    knownSectionRevisions.set(section, revision);
  }
  for (const [section, value] of Object.entries(project)) knownSectionValues.set(section, value);
}

function parseProjectDocument(data: ProjectApiResponse): ProjectDocument {
  if (
    data.status !== "ok"
    || !data.project
    || typeof data.project !== "object"
    || Array.isArray(data.project)
  ) {
    throw new Error(data.message || "Project request failed");
  }
  if (
    !data.sectionRevisions
    || typeof data.sectionRevisions !== "object"
    || Array.isArray(data.sectionRevisions)
    || Object.values(data.sectionRevisions).some((revision) => typeof revision !== "string")
  ) {
    throw new Error("Project response contained invalid section revisions");
  }
  if (data.revision !== undefined && data.revision !== null && typeof data.revision !== "string") {
    throw new Error("Project response contained an invalid document revision");
  }
  const sectionRevisions = data.sectionRevisions;
  return {
    project: data.project,
    revision: typeof data.revision === "string" ? data.revision : null,
    sectionRevisions,
  };
}

async function requestProjectDocument(): Promise<ProjectDocument> {
  const response = await fetch("/api/project", { cache: "no-store" });
  const data = (await response.json()) as ProjectApiResponse;
  if (!response.ok) throw new Error(data.message || "Project load failed");
  return parseProjectDocument(data);
}

export async function fetchProjectDocument(): Promise<ProjectDocument> {
  // Reads refresh the known remote base but never abandon unresolved local
  // conflicts. A full page/session reload reconstructs this module and is the
  // explicit boundary for discarding those local conflict locks.
  const document = await requestProjectDocument();
  rememberProjectSections(document.project, document.sectionRevisions);
  return document;
}

export async function fetchProject(): Promise<ProjectFile> {
  return (await fetchProjectDocument()).project;
}

/**
 * Exact read used by section hydration. It has no process-global side effects,
 * so a superseded StrictMode request cannot roll the optimistic save base back.
 */
export function fetchProjectSectionSnapshot(): Promise<ProjectDocument> {
  return requestProjectDocument();
}

/** Adopts only the validated section from the hydration response. */
export function adoptProjectSectionSnapshot(section: string, document: ProjectDocument): void {
  knownSectionRevisions.set(section, document.sectionRevisions[section] ?? null);
  knownSectionValues.set(section, document.project[section]);
}

async function putProjectPatch(
  patch: ProjectFile,
  expectedSectionRevisions: Record<string, string | null>,
): Promise<ProjectDocument> {
  const response = await fetch("/api/project", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ patch, expectedSectionRevisions }),
  });
  const data = (await response.json()) as ProjectApiResponse;
  if (response.status === 409) {
    throw new ProjectSectionConflictError(
      data.message || "Project changed in another editor session",
      data.section || Object.keys(patch)[0] || "unknown",
      typeof data.actualRevision === "string" ? data.actualRevision : null,
    );
  }
  if (!response.ok) throw new Error(data.message || "Project save failed");
  const document = parseProjectDocument(data);
  rememberProjectSections(document.project, document.sectionRevisions);
  return document;
}

export function saveProjectSection<K extends keyof ProjectFile>(
  section: K,
  value: ProjectFile[K],
): Promise<ProjectFile> {
  const key = section as string;
  const lockedConflict = unresolvedSectionConflicts.get(key);
  if (lockedConflict) {
    return Promise.reject(new ProjectSectionConflictError(
      `Project section '${key}' still conflicts at ${lockedConflict.join(", ")}. Reload and reconcile it before saving.`,
      key,
      knownSectionRevisions.get(key) ?? null,
      lockedConflict,
    ));
  }
  // Saves enqueued from one loaded revision share the last external value
  // observed for that queue. Each local snapshot is rebased over that external
  // base, so a preceding auto-merge is preserved without mistaking an earlier
  // local edit for a second editor's conflicting change.
  const queuedBaseKnown = knownSectionRevisions.has(key);
  const queuedBaseRevision = knownSectionRevisions.get(key) ?? null;
  const queuedBaseValue = knownSectionValues.get(key);
  let queueContext = sectionQueueContexts.get(key);
  if (
    !queueContext
    || (queuedBaseKnown && (!queueContext.baseKnown || queueContext.baseRevision !== queuedBaseRevision))
  ) {
    queueContext = {
      baseKnown: queuedBaseKnown,
      baseRevision: queuedBaseRevision,
      baseValue: queuedBaseValue,
      externalValue: queuedBaseValue,
    };
    sectionQueueContexts.set(key, queueContext);
  }
  const statusGeneration = projectPersistenceStore.markDirty(key);
  const previous = sectionSaveQueues.get(key) ?? Promise.resolve();
  const save = previous.then(async () => {
    const attempt = projectPersistenceStore.beginSave(key, statusGeneration);
    try {
      const unresolved = unresolvedSectionConflicts.get(key);
      if (unresolved) {
        throw new ProjectSectionConflictError(
          `Project section '${key}' still conflicts at ${unresolved.join(", ")}. Reload and reconcile it before saving.`,
          key,
          knownSectionRevisions.get(key) ?? null,
          unresolved,
        );
      }
      if (!knownSectionRevisions.has(key)) {
        const current = await fetchProjectDocument();
        knownSectionRevisions.set(key, current.sectionRevisions[key] ?? null);
      }
      if (!queueContext.baseKnown) {
        queueContext.baseKnown = true;
        queueContext.baseRevision = knownSectionRevisions.get(key) ?? null;
        queueContext.baseValue = knownSectionValues.get(key);
        queueContext.externalValue = queueContext.baseValue;
      }
      const baseValue = knownSectionValues.get(key);
      const rebased = mergeProjectSection(
        key,
        queueContext.baseValue,
        value,
        queueContext.externalValue,
      );
      if (rebased.status === "conflict") {
        unresolvedSectionConflicts.set(key, rebased.paths);
        throw new ProjectSectionConflictError(
          `Queued project edits conflict at ${rebased.paths.join(", ")}. Reload and reconcile before saving.`,
          key,
          knownSectionRevisions.get(key) ?? null,
          rebased.paths,
        );
      }
      let candidateValue: unknown = rebased.value;
      let document: ProjectDocument;
      try {
        document = await putProjectPatch(
          { [section]: candidateValue } as ProjectFile,
          { [section]: knownSectionRevisions.get(key) ?? null },
        );
      } catch (error) {
        if (!(error instanceof ProjectSectionConflictError)) throw error;
        const remote = await requestProjectDocument();
        queueContext.externalValue = remote.project[section];
        const merged = mergeProjectSection(key, baseValue, candidateValue, remote.project[section]);
        if (merged.status === "conflict") {
          unresolvedSectionConflicts.set(key, merged.paths);
          throw new ProjectSectionConflictError(
            `Project section '${key}' has concurrent edits at ${merged.paths.join(", ")}. Reload and reconcile before saving.`,
            key,
            remote.sectionRevisions[key] ?? error.actualRevision,
            merged.paths,
          );
        }
        candidateValue = merged.value;
        try {
          document = await putProjectPatch(
            { [section]: candidateValue } as ProjectFile,
            { [section]: remote.sectionRevisions[key] ?? null },
          );
        } catch (retryError) {
          if (!(retryError instanceof ProjectSectionConflictError)) throw retryError;
          const retryPaths = [`${key} (changed again during merge)`];
          unresolvedSectionConflicts.set(key, retryPaths);
          throw new ProjectSectionConflictError(
            `Project section '${key}' changed again while concurrent edits were being merged. Reload and reconcile before saving.`,
            key,
            retryError.actualRevision,
            retryPaths,
          );
        }
      }
      knownSectionRevisions.set(key, document.sectionRevisions[key] ?? null);
      knownSectionValues.set(key, document.project[section]);
      unresolvedSectionConflicts.delete(key);
      projectPersistenceStore.finishSave(key, attempt);
      return document.project;
    } catch (error) {
      projectPersistenceStore.failSave(
        key,
        attempt,
        error instanceof Error ? error.message : String(error),
        error instanceof ProjectSectionConflictError,
      );
      throw error;
    }
  });
  const settled = save.then(() => undefined, () => undefined);
  sectionSaveQueues.set(key, settled);
  void settled.finally(() => {
    if (sectionSaveQueues.get(key) === settled) {
      sectionSaveQueues.delete(key);
      if (sectionQueueContexts.get(key) === queueContext) sectionQueueContexts.delete(key);
    }
  });
  return save;
}

/** Compatibility API for callers updating several sections at once. */
export async function saveProject(project: ProjectFile): Promise<ProjectFile> {
  const current = await fetchProjectDocument();
  const expected = Object.fromEntries(
    Object.keys(project).map((section) => [section, current.sectionRevisions[section] ?? null]),
  );
  return (await putProjectPatch(project, expected)).project;
}
