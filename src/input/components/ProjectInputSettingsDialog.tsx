import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { LibraryAsset } from "../../lib/asset-api";
import { EditorIcon } from "../../ui/EditorIcon";
import { useProjectInput } from "../application/useProjectInput";
import { ProjectInputSelection } from "./ProjectInputSelection";
import "./input-action-map-inspector.css";
import "./project-input-settings-dialog.css";

/** Project selection remains reachable even when its final source asset is missing. */
export default function ProjectInputSettingsDialog({ assets, onClose }: { assets: readonly LibraryAsset[]; onClose: () => void }) {
  const project = useProjectInput();
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.querySelector<HTMLElement>("button")?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  return createPortal(<div className="input-settings-dialog input-map" role="dialog" aria-modal="true" aria-label="Project Input Settings"
    onKeyDown={(event) => {
      if (event.key === "Escape") { event.stopPropagation(); if (!project.saving) onClose(); }
      if (event.key === "Tab") {
        const focusable = panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled)');
        const first = focusable?.[0], last = focusable?.[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
    <section className="input-settings-dialog__panel" ref={panel} tabIndex={-1}>
      <header><h2>Project Input Settings</h2><button type="button" className="icon-button" aria-label="Close Project Input Settings"
        disabled={project.saving} onClick={onClose}><EditorIcon name="close" size="control" /></button></header>
      <ProjectInputSelection assets={assets} project={project} />
    </section>
  </div>, document.body);
}
