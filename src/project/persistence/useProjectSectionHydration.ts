import { useCallback, useEffect, useRef, useState } from "react";
import {
  adoptProjectSectionSnapshot,
  fetchProjectSectionSnapshot,
  type ProjectFile,
} from "../../lib/project-api";
import { projectPersistenceStore } from "./project-persistence-store";
import { mergeProjectSection, type ProjectSectionMergeResult } from "./project-section-merge";
import { createProjectSectionWriteGate } from "./project-section-write-gate";

export type ProjectSectionHydrationPhase = "pending" | "ready" | "error" | "conflict";

export function shouldHydrateBeforeProjectSectionRetry(
  phase: ProjectSectionHydrationPhase,
): boolean {
  return phase !== "ready";
}

type ProjectSectionHydrationArgs<T> = {
  section: string;
  initialValue: T;
  currentValue: T;
  remoteValue: (project: ProjectFile, initialValue: T) => T;
  applyValue: (value: T) => void;
};

/** Resolves edits made against a browser recovery copy over the remote base. */
export function resolveProjectSectionHydration<T>(
  section: string,
  initialValue: T,
  currentValue: T,
  remoteValue: T,
): ProjectSectionMergeResult {
  return mergeProjectSection(section, initialValue, currentValue, remoteValue);
}

/** Rebases edits made while a save was in flight over its returned canonical value. */
export function resolveProjectSectionAfterSave<T>(
  section: string,
  submittedValue: T,
  currentValue: T,
  canonicalValue: T,
): ProjectSectionMergeResult {
  return mergeProjectSection(section, submittedValue, currentValue, canonicalValue);
}

/**
 * Loads the canonical project section before permitting writes. If the user
 * edits the browser recovery copy while loading, those edits are three-way
 * merged instead of treating the entire fallback as a remote replacement.
 */
export function useProjectSectionHydration<T>(args: ProjectSectionHydrationArgs<T>) {
  const [phase, setPhase] = useState<ProjectSectionHydrationPhase>("pending");
  const phaseRef = useRef<ProjectSectionHydrationPhase>(phase);
  const initialValueRef = useRef(args.initialValue);
  const currentValueRef = useRef(args.currentValue);
  const callbacksRef = useRef({ remoteValue: args.remoteValue, applyValue: args.applyValue });
  const requestGenerationRef = useRef(0);
  const mountedRef = useRef(false);
  const writeGateRef = useRef(createProjectSectionWriteGate<T>());

  phaseRef.current = phase;
  currentValueRef.current = args.currentValue;
  callbacksRef.current = { remoteValue: args.remoteValue, applyValue: args.applyValue };

  const hydrate = useCallback(async () => {
    const generation = ++requestGenerationRef.current;
    if (mountedRef.current) {
      phaseRef.current = "pending";
      setPhase("pending");
    }
    try {
      const document = await fetchProjectSectionSnapshot();
      if (!mountedRef.current || generation !== requestGenerationRef.current) return;
      const project = document.project;
      const remote = callbacksRef.current.remoteValue(project, initialValueRef.current);
      const result = resolveProjectSectionHydration(
        args.section,
        initialValueRef.current,
        currentValueRef.current,
        remote,
      );
      if (result.status === "conflict") {
        const message = `Project section '${args.section}' conflicts at ${result.paths.join(", ")}. Reload and reconcile before saving.`;
        projectPersistenceStore.reportProblem(args.section, message, true);
        phaseRef.current = "conflict";
        setPhase("conflict");
        return;
      }
      // Adopt only after this request is still current and its section passed
      // feature validation. Stale or malformed reads must not influence saves.
      adoptProjectSectionSnapshot(args.section, document);
      writeGateRef.current.acceptCanonicalBase(remote);
      callbacksRef.current.applyValue(result.value as T);
      projectPersistenceStore.clearSection(args.section);
      phaseRef.current = "ready";
      setPhase("ready");
    } catch (error) {
      if (!mountedRef.current || generation !== requestGenerationRef.current) return;
      const message = error instanceof Error ? error.message : String(error);
      projectPersistenceStore.reportProblem(
        args.section,
        `Could not load project ${args.section}: ${message}. Browser recovery data was not written to the project.`,
      );
      phaseRef.current = "error";
      setPhase("error");
    }
  }, [args.section]);

  useEffect(() => {
    mountedRef.current = true;
    void hydrate();
    return () => {
      mountedRef.current = false;
      requestGenerationRef.current += 1;
    };
  }, [hydrate]);

  const needsPersistence = useCallback(
    (value: T) => writeGateRef.current.needsPersistence(value),
    [],
  );
  const acceptPersistedValue = useCallback(
    (submittedValue: T, canonicalValue: T) => {
      const result = resolveProjectSectionAfterSave(
        args.section,
        submittedValue,
        currentValueRef.current,
        canonicalValue,
      );
      writeGateRef.current.acceptCanonicalBase(canonicalValue);
      if (result.status === "conflict") {
        projectPersistenceStore.reportProblem(
          args.section,
          `Project section '${args.section}' conflicts after saving at ${result.paths.join(", ")}. Reload and reconcile before saving again.`,
          true,
        );
        phaseRef.current = "conflict";
        setPhase("conflict");
        return;
      }
      callbacksRef.current.applyValue(result.value as T);
    },
    [args.section],
  );
  const retryOrPersist = useCallback(
    (persist: () => void | Promise<unknown>) => (
      shouldHydrateBeforeProjectSectionRetry(phaseRef.current) ? hydrate() : persist()
    ),
    [hydrate],
  );

  return {
    phase,
    ready: phase === "ready",
    retryHydration: hydrate,
    shouldRetryHydration: () => phaseRef.current === "error",
    needsPersistence,
    acceptPersistedValue,
    retryOrPersist,
  };
}
