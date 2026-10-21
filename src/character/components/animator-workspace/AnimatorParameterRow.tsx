import { useEffect, useRef, useState } from "react";
import type { AnimatorParameter } from "../../domain/animator-parameters";
import { AnimatorGraphContextMenu } from "./AnimatorGraphContextMenu";

type AnimatorParameterRowProps = Readonly<{
  parameter: AnimatorParameter;
  valueLabel: string;
  selected: boolean;
  onSelect: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}>;

type MenuPoint = Readonly<{ x: number; y: number }>;

/** Owns one parameter row's selection, inline rename, and context actions. */
export function AnimatorParameterRow({
  parameter,
  valueLabel,
  selected,
  onSelect,
  onRename,
  onDelete,
}: AnimatorParameterRowProps) {
  const [menu, setMenu] = useState<MenuPoint | null>(null);
  const [renaming, setRenaming] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menu) return undefined;
    const dismissOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(null);
    };
    const dismissOnKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Tab") setMenu(null);
    };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissOnKey);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", dismissOnKey);
    };
  }, [menu]);

  const beginRename = () => {
    setMenu(null);
    setRenaming(true);
  };

  return <>
    {renaming ? (
      <div className="animator-rail-row animator-parameter-row" data-selected={selected || undefined} data-renaming>
        <span className="animator-parameter-kind">{parameterKindInitial(parameter.kind)}</span>
        <input
          className="animator-parameter-row__rename"
          aria-label={`Rename ${parameter.name} parameter`}
          autoFocus
          defaultValue={parameter.name}
          onBlur={(event) => {
            const name = event.currentTarget.value.trim();
            setRenaming(false);
            if (name && name !== parameter.name) onRename(name);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              event.preventDefault();
              event.currentTarget.value = parameter.name;
              event.currentTarget.blur();
            }
          }}
        />
        <small>{valueLabel}</small>
      </div>
    ) : (
      <button
        type="button"
        className="animator-rail-row animator-parameter-row"
        data-selected={selected || undefined}
        aria-label={`Select ${parameter.name} parameter`}
        onClick={onSelect}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onSelect();
          setMenu({ x: event.clientX, y: event.clientY });
        }}
      >
        <span className="animator-parameter-kind">{parameterKindInitial(parameter.kind)}</span>
        <span>{parameter.name}</span>
        <small>{valueLabel}</small>
      </button>
    )}
    {menu && <AnimatorGraphContextMenu
      ariaLabel={`${parameter.name} parameter actions`}
      screenPosition={menu}
      menuRef={menuRef}
      onClose={() => setMenu(null)}
      actions={[
        { id: "rename", label: "Rename", onSelect: beginRename },
        { id: "delete", label: "Delete", onSelect: onDelete },
      ]}
    />}
  </>;
}

function parameterKindInitial(kind: AnimatorParameter["kind"]): string {
  return ({ float: "F", integer: "I", boolean: "B", trigger: "T" })[kind];
}
