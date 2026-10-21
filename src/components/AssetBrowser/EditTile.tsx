import { useEffect, useRef, useState, type ReactNode } from "react";

type EditTileProps = {
  icon: ReactNode;
  initial: string;
  className?: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
};

// Generic inline-edit tile — used for both folder and material rename. Enter
// commits, Escape cancels, blur commits if changed. Self-focuses + selects
// the existing name so the very first keystroke replaces it.
export function EditTile({ icon, initial, className = "", onCommit, onCancel }: EditTileProps) {
  const ref = useRef<HTMLInputElement | null>(null);
  const [value, setValue] = useState(initial);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.focus();
    node.select();
  }, []);

  return (
    <div
      className={`asset-tile asset-tile--editing ${className}`}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      {icon}
      <input
        ref={ref}
        className="asset-tile__name-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(event) => {
          // Important: stopPropagation so the AssetBrowser-level capture-phase
          // keydown (Delete/F2/etc.) doesn't fire while the user is typing.
          event.stopPropagation();
          if (event.key === "Enter") {
            event.preventDefault();
            const trimmed = value.trim();
            if (trimmed) onCommit(trimmed);
            else onCancel();
          } else if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
        onBlur={() => {
          const trimmed = value.trim();
          if (trimmed && trimmed !== initial.trim()) onCommit(trimmed);
          else onCancel();
        }}
      />
    </div>
  );
}
