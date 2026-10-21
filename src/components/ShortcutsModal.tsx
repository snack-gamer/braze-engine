import { useEffect, useRef } from "react";
import { EditorIcon } from "../ui/EditorIcon";

type Shortcut = {
  keys: string[];
  action: string;
};

type ShortcutGroup = {
  title: string;
  items: Shortcut[];
};

type ShortcutsModalProps = {
  modKey: string;
  onClose: () => void;
};

export function ShortcutsModal({ modKey, onClose }: ShortcutsModalProps) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const groups: ShortcutGroup[] = [
    {
      title: "Viewport",
      items: [
        { keys: ["Alt", "Drag"], action: "Orbit around cursor" },
        { keys: ["Alt", "RMB", "Drag"], action: "Zoom" },
        { keys: ["MMB", "Drag"], action: "Pan" },
        { keys: ["Click"], action: "Select object" },
        { keys: ["F"], action: "Frame selected" },
      ],
    },
    {
      title: "Transform",
      items: [
        { keys: ["T"], action: "Transform tool" },
        { keys: ["R"], action: "Rotate tool" },
        { keys: ["S"], action: "Scale tool" },
      ],
    },
    {
      title: "Editing",
      items: [
        { keys: [modKey, "S"], action: "Save scene" },
        { keys: [modKey, "Z"], action: "Undo" },
        { keys: [modKey, "Shift", "Z"], action: "Redo" },
        { keys: [modKey, "D"], action: "Duplicate selected" },
        { keys: [modKey, "Shift", "C"], action: "Toggle Console" },
        { keys: ["Delete"], action: "Delete selected" },
      ],
    },
  ];

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div className="shortcuts-modal" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title">
      <div className="shortcuts-modal__backdrop" onClick={onClose} />
      <div className="shortcuts-modal__panel" onContextMenu={(event) => event.preventDefault()}>
        <div className="shortcuts-modal__head">
          <span className="shortcuts-modal__title" id="shortcuts-title">
            <EditorIcon name="keyboardShortcuts" size="toolbar" />
            Shortcuts
          </span>
          <button ref={closeRef} type="button" className="icon-button" onClick={onClose} title="Close">
            <EditorIcon name="close" size="toolbar" />
          </button>
        </div>

        <div className="shortcuts-modal__groups">
          {groups.map((group) => (
            <section key={group.title} className="shortcuts-modal__group" aria-label={group.title}>
              <h2>{group.title}</h2>
              <div className="shortcuts-modal__rows">
                {group.items.map((item) => (
                  <div key={`${group.title}-${item.action}`} className="shortcuts-modal__row">
                    <div className="shortcuts-modal__keys">
                      {item.keys.map((key) => (
                        <kbd key={key}>{key}</kbd>
                      ))}
                    </div>
                    <span>{item.action}</span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
