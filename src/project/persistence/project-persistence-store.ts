export type ProjectPersistencePhase =
  | "clean"
  | "dirty"
  | "saving"
  | "saved"
  | "error"
  | "conflict";

export type ProjectSectionPersistence = {
  section: string;
  phase: Exclude<ProjectPersistencePhase, "clean">;
  attempt: number;
  generation: number;
  message: string;
  changedAt: number;
};

export type ProjectPersistenceSnapshot = {
  phase: ProjectPersistencePhase;
  sections: Readonly<Record<string, ProjectSectionPersistence>>;
  problemSections: readonly string[];
};

type RetryOperation = () => void | Promise<unknown>;
type Listener = () => void;

const EMPTY_SNAPSHOT: ProjectPersistenceSnapshot = Object.freeze({
  phase: "clean",
  sections: Object.freeze({}),
  problemSections: Object.freeze([]),
});

const phasePriority: Record<ProjectPersistencePhase, number> = {
  clean: 0,
  saved: 1,
  dirty: 2,
  saving: 3,
  error: 4,
  conflict: 5,
};

function aggregateSnapshot(
  sections: Readonly<Record<string, ProjectSectionPersistence>>,
): ProjectPersistenceSnapshot {
  let phase: ProjectPersistencePhase = "clean";
  const problemSections: string[] = [];
  for (const status of Object.values(sections)) {
    if (phasePriority[status.phase] > phasePriority[phase]) phase = status.phase;
    if (status.phase === "error" || status.phase === "conflict") {
      problemSections.push(status.section);
    }
  }
  return Object.freeze({
    phase,
    sections: Object.freeze(sections),
    problemSections: Object.freeze(problemSections.sort()),
  });
}

/**
 * Process-local status for independently persisted project sections.
 *
 * The store deliberately keeps callbacks outside its immutable snapshot so
 * React subscribers receive serializable state, while feature owners retain
 * responsibility for producing the latest value during a retry.
 */
export function createProjectPersistenceStore() {
  let snapshot = EMPTY_SNAPSHOT;
  let nextAttempt = 1;
  const generations = new Map<string, number>();
  const listeners = new Set<Listener>();
  const retryOperations = new Map<string, RetryOperation>();

  const publish = (
    section: string,
    update: (current: ProjectSectionPersistence | undefined) => ProjectSectionPersistence | null,
  ) => {
    const current = snapshot.sections[section];
    const next = update(current);
    if (next === current || next === null) return;
    snapshot = aggregateSnapshot({ ...snapshot.sections, [section]: Object.freeze(next) });
    for (const listener of listeners) listener();
  };

  const notify = () => {
    for (const listener of listeners) listener();
  };

  return {
    getSnapshot: () => snapshot,

    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    reportProblem(section: string, message: string, conflict = false) {
      const attempt = nextAttempt++;
      publish(section, (current) => {
        // A conflict is a session lock, not a transient status. A later load
        // error must not downgrade it and accidentally enable retry/save UI.
        if (current?.phase === "conflict" && !conflict) return current;
        return {
          section,
          phase: conflict ? "conflict" : "error",
          attempt,
          generation: generations.get(section) ?? current?.generation ?? 0,
          message,
          changedAt: Date.now(),
        };
      });
    },

    clearSection(section: string) {
      // Conflicts require an explicit reconciliation boundary (currently a
      // full session reload); ordinary hydration success cannot unlock one.
      if (snapshot.sections[section]?.phase === "conflict") return;
      if (!Object.prototype.hasOwnProperty.call(snapshot.sections, section)) return;
      const remaining = { ...snapshot.sections };
      delete remaining[section];
      snapshot = aggregateSnapshot(remaining);
      notify();
    },

    markDirty(section: string) {
      const generation = (generations.get(section) ?? 0) + 1;
      generations.set(section, generation);
      publish(section, (current) => {
        if (current?.phase === "conflict") {
          return { ...current, generation, changedAt: Date.now() };
        }
        return {
          section,
          phase: "dirty",
          attempt: current?.attempt ?? 0,
          generation,
          message: "",
          changedAt: Date.now(),
        };
      });
      return generation;
    },

    beginSave(section: string, generation = generations.get(section) ?? 0): number {
      const attempt = nextAttempt++;
      const latestGeneration = generations.get(section) ?? generation;
      publish(section, (current) => {
        if (current?.phase === "conflict") {
          return current.generation === latestGeneration
            ? current
            : { ...current, generation: latestGeneration, changedAt: Date.now() };
        }
        return {
          section,
          phase: generation < latestGeneration ? "dirty" : "saving",
          attempt,
          generation: latestGeneration,
          message: "",
          changedAt: Date.now(),
        };
      });
      return attempt;
    },

    finishSave(section: string, attempt: number) {
      publish(section, (current) => {
        // A new local edit can mark the section dirty while this request is in
        // flight. Its older completion must not clear that newer dirty state.
        if (current?.attempt !== attempt || current.phase !== "saving") return current ?? null;
        return {
          ...current,
          phase: "saved",
          message: "",
          changedAt: Date.now(),
        };
      });
    },

    failSave(section: string, attempt: number, message: string, conflict = false) {
      publish(section, (current) => {
        // A conflict discovered by an older in-flight save still applies to a
        // newer local edit. Latch it instead of leaving the section looking
        // merely dirty until another queued request happens to run.
        if (conflict) {
          return {
            section,
            phase: "conflict",
            attempt: current?.attempt ?? attempt,
            generation: generations.get(section) ?? current?.generation ?? 0,
            message,
            changedAt: Date.now(),
          };
        }
        if (current?.attempt !== attempt || current.phase !== "saving") return current ?? null;
        return {
          ...current,
          phase: "error",
          message,
          changedAt: Date.now(),
        };
      });
    },

    registerRetry(section: string, operation: RetryOperation) {
      retryOperations.set(section, operation);
      return () => {
        if (retryOperations.get(section) === operation) retryOperations.delete(section);
      };
    },

    retryFailed() {
      for (const [section, operation] of retryOperations) {
        // Conflicts require an explicit merge/reload choice. Replaying them
        // automatically would turn optimistic concurrency into data loss.
        if (snapshot.sections[section]?.phase !== "error") continue;
        try {
          void Promise.resolve(operation()).catch(() => undefined);
        } catch {
          // The feature's save boundary publishes the actionable error.
        }
      }
    },
  };
}

export const projectPersistenceStore = createProjectPersistenceStore();
