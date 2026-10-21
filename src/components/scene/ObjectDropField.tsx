import { useEffect, useRef, useState, type DragEvent } from "react";
import type { SceneObject } from "../../types";
import { extractHierarchyRows, HIERARCHY_ROWS_TYPE, HIERARCHY_ROW_TYPE } from "../AssetBrowser/drag";

type ObjectDropFieldProps = {
  objects: SceneObject[];
  value?: string;
  placeholder: string;
  className: string;
  dropEffect?: DataTransfer["dropEffect"];
  onAssign: (objectId: string) => void;
};

export function ObjectDropField({
  objects,
  value,
  placeholder,
  className,
  dropEffect = "move",
  onAssign,
}: ObjectDropFieldProps) {
  const hoveringRef = useRef(false);
  const [dragActive, setDragActive] = useState(false);
  const targetObject = value ? objects.find((object) => object.id === value) ?? null : null;

  const assignFirstValid = (ids: string[] | undefined) => {
    const objectId = ids?.find((rowId) => objects.some((object) => object.id === rowId));
    if (objectId) onAssign(objectId);
  };

  const hasHierarchyDrag = (event: DragEvent<HTMLElement>) =>
    event.dataTransfer.types.includes(HIERARCHY_ROW_TYPE) || event.dataTransfer.types.includes(HIERARCHY_ROWS_TYPE);

  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    if (!hasHierarchyDrag(event)) return;
    hoveringRef.current = true;
    setDragActive(true);
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = dropEffect;
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    if (!hasHierarchyDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = dropEffect;
    hoveringRef.current = false;
    setDragActive(false);
    assignFirstValid(extractHierarchyRows(event.dataTransfer));
  };

  const handleDragLeave = (event: DragEvent<HTMLElement>) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    hoveringRef.current = false;
    setDragActive(false);
  };

  useEffect(() => {
    const onDragEnd = (event: Event) => {
      if (!hoveringRef.current) return;
      hoveringRef.current = false;
      setDragActive(false);
      assignFirstValid((event as CustomEvent<{ ids?: string[] }>).detail?.ids);
    };
    window.addEventListener("tgan:hierarchy-drag-end", onDragEnd);
    return () => window.removeEventListener("tgan:hierarchy-drag-end", onDragEnd);
  });

  return (
    <span
      className={`${className} ${dragActive ? "dragging" : ""}`}
      onDragEnter={handleDragOver}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        readOnly
        value={targetObject ? targetObject.name || targetObject.id : ""}
        placeholder={placeholder}
      />
    </span>
  );
}
