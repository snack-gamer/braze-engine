import { useCallback, useEffect, useState } from "react";
import type { Material } from "../types";
import { saveProjectSection, type ProjectFile } from "../lib/api";
import { projectPersistenceStore } from "../project/persistence/project-persistence-store";
import { useProjectSectionHydration } from "../project/persistence/useProjectSectionHydration";
import { createAuthoredId } from "../identity/authored-id";
import {
  normalizeMaterialLibraryEntry,
  normalizeProjectMaterials,
  normalizeStoredMaterials,
} from "../materials/serialization/material-library-codec";

export {
  normalizeProjectMaterials,
  normalizeStoredMaterials,
} from "../materials/serialization/material-library-codec";

const MATERIALS_KEY = "braze.materials";
const LEGACY_MATERIALS_KEY = "tgan.materials";

function makeId(): string {
  return createAuthoredId("mat");
}

function loadMaterials(): Material[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(MATERIALS_KEY) ?? window.localStorage.getItem(LEGACY_MATERIALS_KEY);
    if (!raw) return [];
    return normalizeStoredMaterials(JSON.parse(raw));
  } catch {
    return [];
  }
}

// Materials live in a flat library — no nesting, no parent/child. The browser
// copy is a recovery base; useProjectSectionHydration must reconcile it with
// the canonical project before any project write is enabled. Each
// SceneObject can reference at most one Material via `materialId`; the
// material drives all of that object's mesh surfaces (matches the C4D model
// where one material tag controls everything by default).
export function useMaterials() {
  const [materials, setMaterials] = useState<Material[]>(loadMaterials);
  const remoteMaterials = useCallback((project: ProjectFile, initial: Material[]): Material[] => {
    if (!Object.prototype.hasOwnProperty.call(project, "materials")) return initial;
    return normalizeProjectMaterials(project.materials);
  }, []);
  const applyHydratedMaterials = useCallback((value: Material[]) => {
    setMaterials(normalizeStoredMaterials(value));
  }, []);
  const hydration = useProjectSectionHydration({
    section: "materials",
    initialValue: materials,
    currentValue: materials,
    remoteValue: remoteMaterials,
    applyValue: applyHydratedMaterials,
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(MATERIALS_KEY, JSON.stringify(materials));
      window.localStorage.removeItem(LEGACY_MATERIALS_KEY);
    } catch {
      // Material persistence is best-effort.
    }
  }, [materials]);

  useEffect(() => {
    if (!hydration.ready || !hydration.needsPersistence(materials)) return;
    const snapshot = materials;
    const timeout = window.setTimeout(() => {
      void saveProjectSection("materials", snapshot)
        .then((project) => hydration.acceptPersistedValue(
          snapshot,
          normalizeProjectMaterials(project.materials),
        ))
        .catch(() => {
          // The browser copy remains recoverable; the global project status keeps
          // this failure visible instead of pretending the canonical save worked.
        });
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [hydration.acceptPersistedValue, hydration.needsPersistence, hydration.ready, materials]);

  useEffect(() => projectPersistenceStore.registerRetry(
    "materials",
    () => hydration.retryOrPersist(() => saveProjectSection("materials", materials)
      .then((project) => hydration.acceptPersistedValue(
        materials,
        normalizeProjectMaterials(project.materials),
      ))),
  ), [hydration.acceptPersistedValue, hydration.retryOrPersist, materials]);

  const create = useCallback(() => {
    const name = `Material ${materials.length + 1}`;
    const next = normalizeMaterialLibraryEntry({}, name);
    setMaterials((items) => [...items, next]);
    return next.id;
  }, [materials.length]);

  const createFrom = useCallback((patch: Partial<Material> & { name?: string }) => {
    const next = normalizeMaterialLibraryEntry(patch, patch.name || "Material");
    setMaterials((items) => [...items, next]);
    return next.id;
  }, []);

  const createMany = useCallback((patches: Array<Partial<Material> & { name?: string }>) => {
    const next = patches.map((patch, index) => (
      normalizeMaterialLibraryEntry(patch, patch.name || `Material ${index + 1}`)
    ));
    setMaterials((items) => [...items, ...next]);
    return next;
  }, []);

  const update = useCallback((id: string, patch: Partial<Material>) => {
    setMaterials((items) => items.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  const remove = useCallback((id: string) => {
    setMaterials((items) => items.filter((m) => m.id !== id));
  }, []);

  const duplicate = useCallback(
    (id: string) => {
      const source = materials.find((m) => m.id === id);
      if (!source) return null;
      const next: Material = { ...source, id: makeId(), name: `${source.name} copy` };
      setMaterials((items) => [...items, next]);
      return next.id;
    },
    [materials],
  );

  return { materials, create, createFrom, createMany, update, remove, duplicate };
}
