import { useState } from "react";
import { createPortal } from "react-dom";
import { EditorIcon } from "./EditorIcon";
import type { EditorIconName } from "./icons";

export type CatalogPaletteItem = Readonly<{
  id: string;
  label: string;
  category: string;
  description: string;
  aliases?: readonly string[];
  icon: EditorIconName;
}>;

type CatalogPaletteProps = Readonly<{
  title: string;
  titleIcon: EditorIconName;
  items: readonly CatalogPaletteItem[];
  onSelect: (id: string) => void;
  onClose: () => void;
}>;

/** Shared editor palette chrome; callers retain ownership of commands and catalog data. */
export function CatalogPalette({
  title,
  titleIcon,
  items,
  onSelect,
  onClose,
}: CatalogPaletteProps) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const visible = needle ? items.filter((item) => (
    `${item.label} ${item.category} ${item.description} ${item.aliases?.join(" ") ?? ""}`.toLowerCase().includes(needle)
  )) : items;
  const categories = [...new Set(visible.map((item) => item.category))];

  return createPortal(
    <section
      className="catalog-palette"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        onClose();
      }}
    >
      <div>
        <header>
          <span><EditorIcon name={titleIcon} size="toolbar" /></span>
          <h2>{title}</h2>
          <label>
            <EditorIcon name="search" size="row-action" />
            <input
              autoFocus
              type="search"
              value={query}
              placeholder="Search…"
              aria-label="Search palette"
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
          </label>
          <kbd>ESC</kbd>
        </header>
        <div>
          {categories.map((category) => {
            const categoryItems = visible.filter((item) => item.category === category);
            return (
              <section key={category} data-category={category}>
                <header>
                  <i />
                  <h3>{category}</h3>
                  <small>{categoryItems.length}</small>
                  <hr />
                </header>
                <div>
                  {categoryItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="catalog-palette__item"
                      title={item.description}
                      onClick={() => onSelect(item.id)}
                    >
                      <span><EditorIcon name={item.icon} size="control" /></span>
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
          {categories.length === 0 && <p className="catalog-palette__empty">No matching results</p>}
        </div>
      </div>
    </section>,
    document.body,
  );
}
