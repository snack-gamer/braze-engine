import { useEffect, useRef, useState } from "react";
import type { PrimitiveKind } from "../../types";
import { EditorIcon } from "../../ui/EditorIcon";
import { primitiveIconNames } from "../../ui/icons";

type HierarchyAddMenuProps = {
  addPrimitive: (kind: PrimitiveKind) => void;
  addCamera: () => void;
};

const primitiveOptions = [
  ["transform", "transformMove", "Transform"],
  ["cube", primitiveIconNames.cube, "Cube"],
  ["sphere", primitiveIconNames.sphere, "Sphere"],
  ["plane", primitiveIconNames.plane, "Plane"],
  ["cloner", primitiveIconNames.cloner, "Cloner"],
  ["effector", primitiveIconNames.effector, "Effector"],
  ["particle", primitiveIconNames.particle, "Particles"],
] as const;

// Objects-rail "Add" dropdown — strictly app-resident scene objects
// (primitives + cameras). File imports live in the asset browser's
// "Import" button so the two entry points don't overlap.
export function HierarchyAddMenu({ addPrimitive, addCamera }: HierarchyAddMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && wrapRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    return () => window.removeEventListener("pointerdown", onPointer);
  }, [open]);

  const handle = (action: () => void) => () => {
    action();
    setOpen(false);
  };

  return (
    <div className="add-menu" ref={wrapRef}>
      <button
        type="button"
        className={`add-menu__trigger ${open ? "open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <EditorIcon name="add" size="tree" />
        <span>Add</span>
      </button>
      {open && (
        <div className="add-menu__popover" role="menu">
          {primitiveOptions.map(([kind, icon, label]) => (
            <HierarchyAddMenuItem key={kind} icon={icon} label={label} onSelect={handle(() => addPrimitive(kind))} />
          ))}
          <HierarchyAddMenuItem icon={primitiveIconNames.camera} label="Camera" onSelect={handle(addCamera)} />
          <HierarchyAddMenuItem
            icon={primitiveIconNames.directionalLight}
            label="Directional Light"
            onSelect={handle(() => addPrimitive("directionalLight"))}
          />
        </div>
      )}
    </div>
  );
}

function HierarchyAddMenuItem({
  icon,
  label,
  onSelect,
}: {
  icon: Parameters<typeof EditorIcon>[0]["name"];
  label: string;
  onSelect: () => void;
}) {
  return (
    <button type="button" role="menuitem" onClick={onSelect}>
      <EditorIcon name={icon} size="control" />
      <span>{label}</span>
    </button>
  );
}
