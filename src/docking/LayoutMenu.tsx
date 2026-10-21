import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { EditorIcon } from "../ui/EditorIcon";
import { BUILTIN_DOCK_LAYOUTS } from "./layout-presets";
import { parseDockDocument, type DockLayoutDocument } from "./layout";

const SAVED_LAYOUTS_KEY = "braze.editor.saved-layouts.v1";
const FILE_KIND = "braze/editor-layout-preset";
const FILE_VERSION = 1;

type SavedLayout = {
  name: string;
  document: DockLayoutDocument;
  updatedAt: string;
};

type LayoutPresetFile = {
  kind: typeof FILE_KIND;
  version: typeof FILE_VERSION;
  name: string;
  document: DockLayoutDocument;
};

type LayoutMenuProps = {
  document: DockLayoutDocument;
  onApply: (document: DockLayoutDocument) => void;
  onReset: () => void;
};

function readSavedLayouts(): SavedLayout[] {
  try {
    const raw = window.localStorage.getItem(SAVED_LAYOUTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((candidate) => {
      if (!candidate || typeof candidate !== "object") return [];
      const value = candidate as Partial<SavedLayout>;
      const document = parseDockDocument(value.document);
      if (!document || typeof value.name !== "string" || !value.name.trim()) return [];
      return [{
        name: value.name.trim().slice(0, 60),
        document,
        updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
      }];
    });
  } catch {
    return [];
  }
}

function writeSavedLayouts(layouts: SavedLayout[]): void {
  try {
    window.localStorage.setItem(SAVED_LAYOUTS_KEY, JSON.stringify(layouts));
  } catch {
    // Named layout persistence is optional; the current dock still works.
  }
}

function documentKey(document: DockLayoutDocument): string {
  return JSON.stringify(document);
}

function safeFilename(name: string): string {
  const normalized = name.trim().replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "");
  return `${normalized || "braze-layout"}.braze-layout.json`;
}

export function LayoutMenu({ document, onApply, onReset }: LayoutMenuProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [savedLayouts, setSavedLayouts] = useState<SavedLayout[]>(readSavedLayouts);
  const currentKey = useMemo(() => documentKey(document), [document]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.document.addEventListener("mousedown", closeOnOutside);
    window.document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.document.removeEventListener("mousedown", closeOnOutside);
      window.document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const commitSavedLayouts = (next: SavedLayout[]) => {
    setSavedLayouts(next);
    writeSavedLayouts(next);
  };

  const apply = (next: DockLayoutDocument) => {
    onApply(next);
    setOpen(false);
  };

  const saveNamedLayout = () => {
    const requested = window.prompt("Save current editor layout as:", "My Layout");
    const name = requested?.trim().slice(0, 60);
    if (!name) return;
    const existing = savedLayouts.find((layout) => layout.name.toLowerCase() === name.toLowerCase());
    if (existing && !window.confirm(`Replace the saved layout “${existing.name}”?`)) return;
    const next: SavedLayout = {
      name,
      document,
      updatedAt: new Date().toISOString(),
    };
    commitSavedLayouts([
      ...savedLayouts.filter((layout) => layout.name.toLowerCase() !== name.toLowerCase()),
      next,
    ].sort((a, b) => a.name.localeCompare(b.name)));
    setOpen(false);
  };

  const exportLayout = () => {
    const activeName = savedLayouts.find((layout) => documentKey(layout.document) === currentKey)?.name
      ?? BUILTIN_DOCK_LAYOUTS.find((layout) => documentKey(layout.document) === currentKey)?.name
      ?? "Braze Layout";
    const payload: LayoutPresetFile = {
      kind: FILE_KIND,
      version: FILE_VERSION,
      name: activeName,
      document,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = safeFilename(activeName);
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setOpen(false);
  };

  const importLayout = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text()) as unknown;
      const candidate = raw && typeof raw === "object" && "document" in raw
        ? (raw as Partial<LayoutPresetFile>).document
        : raw;
      const next = parseDockDocument(candidate);
      if (!next) throw new Error("The file does not contain a complete Braze editor layout.");
      apply(next);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Unable to load the layout file.");
    }
  };

  return (
    <div ref={rootRef} className="layout-menu">
      <button
        type="button"
        className={`ghost-button layout-menu__trigger ${open ? "active" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Editor layouts"
        onClick={() => setOpen((value) => !value)}
      >
        <EditorIcon name="editorLayout" size="control" />
        <span>Layout</span>
        <EditorIcon name="disclosureOpen" size="compact" />
      </button>

      <input
        ref={fileInputRef}
        type="file"
        className="hidden-input"
        accept=".json,.braze-layout.json,application/json"
        onChange={(event) => void importLayout(event)}
      />

      {open && (
        <div className="layout-menu__panel" role="menu" aria-label="Editor layouts">
          <div className="layout-menu__heading">Built-in layouts</div>
          {BUILTIN_DOCK_LAYOUTS.map((layout) => {
            const active = documentKey(layout.document) === currentKey;
            return (
              <button
                key={layout.id}
                type="button"
                className={`layout-menu__item ${active ? "is-active" : ""}`}
                role="menuitemradio"
                aria-checked={active}
                onClick={() => apply(layout.document)}
              >
                <span>{layout.name}</span>
              </button>
            );
          })}

          {savedLayouts.length > 0 && (
            <>
              <div className="layout-menu__separator" />
              <div className="layout-menu__heading">Saved layouts</div>
              {savedLayouts.map((layout) => {
                const active = documentKey(layout.document) === currentKey;
                return (
                  <div key={layout.name} className="layout-menu__saved-row">
                    <button
                      type="button"
                      className={`layout-menu__item ${active ? "is-active" : ""}`}
                      role="menuitemradio"
                      aria-checked={active}
                      onClick={() => apply(layout.document)}
                    >
                      <span>{layout.name}</span>
                    </button>
                    <button
                      type="button"
                      className="icon-button compact layout-menu__delete"
                      aria-label={`Delete saved layout ${layout.name}`}
                      title={`Delete ${layout.name}`}
                      onClick={() => commitSavedLayouts(savedLayouts.filter((candidate) => candidate.name !== layout.name))}
                    >
                      <EditorIcon name="delete" size="compact" />
                    </button>
                  </div>
                );
              })}
            </>
          )}

          <div className="layout-menu__separator" />
          <button type="button" className="layout-menu__item" role="menuitem" onClick={saveNamedLayout}>
            <EditorIcon name="save" size="control" />
            <span>Save Current Layout…</span>
          </button>
          <button type="button" className="layout-menu__item" role="menuitem" onClick={exportLayout}>
            <EditorIcon name="save" size="control" />
            <span>Save Layout to File…</span>
          </button>
          <button type="button" className="layout-menu__item" role="menuitem" onClick={() => fileInputRef.current?.click()}>
            <EditorIcon name="upload" size="control" />
            <span>Load Layout from File…</span>
          </button>
          <div className="layout-menu__separator" />
          <button
            type="button"
            className="layout-menu__item"
            role="menuitem"
            onClick={() => {
              onReset();
              setOpen(false);
            }}
          >
            <EditorIcon name="reset" size="control" />
            <span>Reset Current Layout</span>
          </button>
          <button
            type="button"
            className="layout-menu__item"
            role="menuitem"
            disabled={savedLayouts.length === 0}
            onClick={() => commitSavedLayouts([])}
          >
            <EditorIcon name="delete" size="control" />
            <span>Delete All Saved Layouts</span>
          </button>
        </div>
      )}
    </div>
  );
}
