import { useEffect, useRef, useState } from "react";
import { EditorIcon } from "../../../ui/EditorIcon";
import type { AnimatorParameterKind } from "../../application/animator-controller-authoring";

const PARAMETER_TYPES: readonly Readonly<{
  kind: AnimatorParameterKind;
  label: string;
}>[] = [
  { kind: "float", label: "Float" },
  { kind: "integer", label: "Int" },
  { kind: "boolean", label: "Bool" },
  { kind: "trigger", label: "Trigger" },
];

export function AnimatorParameterCreateMenu({
  onCreate,
}: Readonly<{ onCreate: (kind: AnimatorParameterKind) => void }>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const firstItemRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    firstItemRef.current?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const dismissWithKeyboard = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", dismiss, true);
    window.addEventListener("keydown", dismissWithKeyboard, true);
    return () => {
      document.removeEventListener("pointerdown", dismiss, true);
      window.removeEventListener("keydown", dismissWithKeyboard, true);
    };
  }, [open]);

  return <div ref={rootRef} className="animator-parameter-create">
    <button
      ref={triggerRef}
      type="button"
      className="animator-parameter-create__trigger"
      aria-label="Add parameter"
      aria-haspopup="menu"
      aria-expanded={open}
      title="Add parameter"
      onClick={() => setOpen((current) => !current)}
    >
      <EditorIcon name="add" size="row-action" />
      <EditorIcon name="disclosureOpen" size="micro" />
    </button>
    {open && <div
      className="animator-parameter-create__menu"
      role="menu"
      aria-label="Parameter types"
    >
      {PARAMETER_TYPES.map((type, index) => <button
        ref={index === 0 ? firstItemRef : undefined}
        type="button"
        role="menuitem"
        key={type.kind}
        onClick={() => {
          setOpen(false);
          onCreate(type.kind);
        }}
      >{type.label}</button>)}
    </div>}
  </div>;
}
