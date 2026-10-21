import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { EditorIcon } from "../../ui/EditorIcon";
import type { HumanoidMappingBone } from "../application/humanoid-mapping";
import type { BoneId } from "../domain/skeleton";

type BoneSelectProps = Readonly<{
  bones: readonly HumanoidMappingBone[];
  value?: BoneId;
  onChange: (boneId: BoneId | undefined) => void;
  emptyLabel?: string;
}>;

type MenuPosition = Readonly<{ left: number; top: number; width: number; maxHeight: number }>;

/** Renders one shared-on-demand bone list instead of thousands of dormant native options. */
export function BoneSelect({
  bones,
  value,
  onChange,
  emptyLabel = "None",
}: BoneSelectProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const selected = useMemo(() => bones.find((bone) => bone.id === value), [bones, value]);
  const filteredBones = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return bones;
    return bones.filter((bone) => `${bone.name} ${bone.path}`.toLowerCase().includes(normalized));
  }, [bones, query]);

  useLayoutEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const bounds = triggerRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const margin = 8;
      const width = Math.min(520, Math.max(300, bounds.width));
      const left = Math.max(margin, Math.min(bounds.left, window.innerWidth - width - margin));
      const below = window.innerHeight - bounds.bottom - margin;
      const above = bounds.top - margin;
      const placeBelow = below >= Math.min(280, above);
      const maxHeight = Math.max(160, Math.min(340, placeBelow ? below : above));
      setPosition({
        left,
        top: placeBelow ? bounds.bottom + 4 : Math.max(margin, bounds.top - maxHeight - 4),
        width,
        maxHeight,
      });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus({ preventScroll: true });
    const closeOnPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const choose = (boneId: BoneId | undefined) => {
    onChange(boneId);
    setOpen(false);
    setQuery("");
    triggerRef.current?.focus({ preventScroll: true });
  };
  const menuStyle: CSSProperties | undefined = position ? {
    left: position.left,
    top: position.top,
    width: position.width,
    maxHeight: position.maxHeight,
  } : undefined;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="avatar-bone-select"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={selected?.path ?? emptyLabel}
      >
        <span className={selected ? "" : "avatar-bone-select__empty"}>{selected?.name ?? emptyLabel}</span>
        {selected && <small>{selected.path}</small>}
        <EditorIcon name="disclosureOpen" size="compact" />
      </button>
      {open && position && createPortal(
        <div ref={menuRef} className="avatar-bone-picker" style={menuStyle} role="dialog" aria-label="Choose bone">
          <label className="avatar-bone-picker__search">
            <EditorIcon name="search" size="compact" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Search imported bones"
              aria-label="Search imported bones"
            />
          </label>
          <div className="avatar-bone-picker__list" role="listbox" aria-label="Imported bones">
            <button
              type="button"
              role="option"
              aria-selected={!value}
              className={!value ? "active" : ""}
              onClick={() => choose(undefined)}
            >
              <span>{emptyLabel}</span><small>Clear mapping</small>
            </button>
            {filteredBones.map((bone) => (
              <button
                type="button"
                role="option"
                aria-selected={bone.id === value}
                className={bone.id === value ? "active" : ""}
                key={bone.id}
                onClick={() => choose(bone.id)}
                title={bone.path}
              >
                <span>{bone.name}</span><small>{bone.path}</small>
              </button>
            ))}
            {filteredBones.length === 0 && <p>No bones match “{query}”.</p>}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
