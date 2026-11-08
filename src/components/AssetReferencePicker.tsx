import { AssetFilterBar } from "./AssetBrowser/AssetFilterBar";
import { usePersistedJson, isStringArray } from "./AssetBrowser/preferences";
import type { AssetFilter } from "./AssetBrowser/types";
import { EditorRange } from "../ui/controls/EditorRange";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { EditorIcon } from "../ui/EditorIcon";
import "../ui/asset-reference-picker.css";
export type AssetPickerChoice<T> = { name: string; detail: string; value: T; source?: string; folder?: string; assetKey?: string };
const PAGE_SIZE = 60;
export function AssetReferencePicker<T>({ choices, value, onChoose, onClose, title, searchLabel, closeLabel, listLabel, icon, preview, assetType }: {
  choices: readonly AssetPickerChoice<T>[]; value: T; onChoose: (value: T) => void; onClose: () => void;
  assetType: "models" | "materials"; title: string; searchLabel: string; closeLabel: string; listLabel: string; icon: ReactNode;
  preview?: (item: AssetPickerChoice<T>, enabled: boolean) => ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null), search = useRef<HTMLInputElement>(null), list = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(""), [source, setSource] = useState(""), [folder, setFolder] = useState("");
  const [sort, setSort] = useState("az"), [view, setView] = useState("grid"), [size, setSize] = useState(88), [page, setPage] = useState(0);
  const key = (item: T) => JSON.stringify(item);
  const [selected, setSelected] = useState(() => choices.find((item) => key(item.value) === key(value)) ?? choices[0]);
  const [filter, setFilter] = useState<AssetFilter>("all");
  const [favorites] = usePersistedJson<string[]>("tgan.assetFavorites", [], isStringArray);
  const [recent, setRecent] = usePersistedJson<string[]>("tgan.assetRecent", [], isStringArray);
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const matches = choices.filter((item) => (filter !== "favorites" && filter !== "recent" || (filter === "favorites" ? favorites : recent).includes(item.assetKey ?? "")) && (!source || !item.source || source === item.source) && (!folder || !item.source || folder === (item.folder || "Assets"))
    && terms.every((term) => `${item.name} ${item.detail} ${item.folder ?? ""} ${item.source ?? ""}`.toLowerCase().includes(term)))
    .sort((a, b) => a.value === null ? -1 : b.value === null ? 1 : (sort === "za" ? -1 : 1) * a.name.localeCompare(b.name));
  const pageCount = Math.max(1, Math.ceil(matches.length / PAGE_SIZE)), currentPage = Math.min(page, pageCount - 1);
  const visible = matches.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const sources = [...new Set(choices.flatMap((item) => item.source ? [item.source] : []))].sort();
  const folders = [...new Set(choices.filter((item) => item.source && (!source || item.source === source)).map((item) => item.folder || "Assets"))].sort();
  const choose = (item = selected) => { if (item) { if (item.assetKey) setRecent((previous) => [item.assetKey!, ...previous.filter((id) => id !== item.assetKey)].slice(0, 24)); onChoose(item.value); } };
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null, modal = dialog.current!;
    modal.showModal(); search.current?.focus();
    return () => { modal.close(); previous?.focus(); };
  }, []);
  return createPortal(<dialog ref={dialog} className="asset-picker" aria-label={title} onCancel={(event) => {
    event.preventDefault(); onClose();
  }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} onKeyDown={(event) => {
    event.stopPropagation();
    if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const options = [...(list.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])];
    const index = options.indexOf(document.activeElement as HTMLButtonElement);
    if (event.target === search.current ? event.key !== "ArrowDown" : index < 0) return;
    if (!options.length) return;
    const columns = view === "grid" ? Math.max(1, Math.floor((list.current!.clientWidth - 16) / (size + 8))) : 1;
    const step = event.key === "ArrowDown" ? columns : event.key === "ArrowUp" ? -columns : event.key === "ArrowRight" ? 1 : -1;
    const next = index < 0 || event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : Math.max(0, Math.min(options.length - 1, index + step));
    event.preventDefault(); options[next]?.focus(); options[next]?.scrollIntoView({ block: "nearest" });
  }}>
    <div className="asset-picker__content">
      <header><strong>{title}</strong><button type="button" className="icon-button" aria-label={closeLabel} onClick={onClose}><EditorIcon name="close" size="compact" /></button></header>
      <div className="asset-picker__toolbar editor-toolbar" role="toolbar" aria-label="Asset browser tools">
        <div className="asset-picker__views editor-segmented editor-segmented--icons editor-action-strip" role="group" aria-label="Asset view">
          <button type="button" className="icon-button" aria-label="Grid view" aria-pressed={view === "grid"} onClick={() => setView("grid")}><EditorIcon name="gridView" size="control" /></button>
          <button type="button" className="icon-button" aria-label="List view" aria-pressed={view === "list"} onClick={() => setView("list")}><EditorIcon name="listView" size="control" /></button>
        </div>
      <div className="asset-picker__search editor-toolbar__search"><EditorIcon name="search" size="control" /><input ref={search} type="search" aria-label={searchLabel}
        placeholder="Search names or paths…" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} />
        {query && <button type="button" aria-label="Clear search" onClick={() => { setQuery(""); setPage(0); search.current?.focus(); }}>Clear</button>}</div>
        <AssetFilterBar value={filter} allowed={["all", assetType, "favorites", "recent"]} onChange={(next) => { setFilter(next); setPage(0); }} />
        <label><select aria-label="Asset source" value={source} onChange={(event) => { setSource(event.target.value); setFolder(""); setPage(0); }}>
          <option value="">All sources</option>{sources.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><select aria-label="Asset folder" value={folder} onChange={(event) => { setFolder(event.target.value); setPage(0); }}>
          <option value="">All folders</option>{folders.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><select aria-label="Sort assets" value={sort} onChange={(event) => { setSort(event.target.value); setPage(0); }}><option value="az">Name A to Z</option><option value="za">Name Z to A</option></select></label>
        <div className="asset-picker__zoom editor-control-group">
          <button type="button" className="icon-button compact" aria-label="Smaller previews" disabled={view !== "grid" || size <= 56} onClick={() => setSize(Math.max(56, size - 16))}><EditorIcon name="zoomOut" size="control" /></button>
          <EditorRange aria-label="Preview size" min={56} max={152} step={16} value={size} disabled={view !== "grid"} onChange={(event) => setSize(Number(event.target.value))} />
          <button type="button" className="icon-button compact" aria-label="Larger previews" disabled={view !== "grid" || size >= 152} onClick={() => setSize(Math.min(152, size + 16))}><EditorIcon name="zoomIn" size="control" /></button>
        </div>
      </div>
      <div className="asset-picker__results" aria-live="polite"><span>{matches.length} matching {matches.length === 1 ? "asset" : "assets"}</span>
        {pageCount > 1 && <span className="asset-picker__pages"><button type="button" disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>Previous</button>
          {currentPage + 1} / {pageCount}<button type="button" disabled={currentPage === pageCount - 1} onClick={() => setPage(currentPage + 1)}>Next</button></span>}</div>
      <div ref={list} className={`asset-picker__list asset-picker__list--${view}`} role="listbox" aria-label={listLabel} style={{ "--picker-size": `${size}px` } as CSSProperties}>
        {visible.map((item) => <button type="button" role="option" key={key(item.value)} aria-label={`${item.name} ${item.detail}`}
          aria-selected={key(selected?.value) === key(item.value)} title={`${item.name} (${item.detail})`}
          onFocus={() => setSelected(item)} onClick={() => setSelected(item)} onDoubleClick={() => choose(item)}
          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); choose(item); } }}>
          <span className="asset-picker__preview" aria-hidden="true">{preview?.(item, view === "grid") ?? icon}</span>
          <span className="asset-picker__name">{item.name}<small>{item.detail}</small></span>
        </button>)}
        {!matches.length && <p className="asset-picker__empty">No matching assets. Try another search or filter.</p>}
      </div>
      <footer><div className="asset-picker__details">
        <span className="asset-picker__detail-preview" aria-hidden="true">{selected ? preview?.(selected, true) ?? icon : icon}</span>
        <div><strong>{selected?.name ?? "Select an asset"}</strong><small>{selected?.source ?? "Default"}</small><small title={selected?.detail}>{selected?.detail}</small></div>
      </div><div className="asset-picker__actions"><span>Double-click or press Enter to select</span><button type="button" onClick={onClose}>Cancel</button>
        <button type="button" disabled={!selected} onClick={() => choose()}>Select</button></div></footer>
    </div>
  </dialog>, document.body);
}
