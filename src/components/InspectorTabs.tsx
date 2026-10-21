import { useEffect, useState, type ReactNode } from "react";

const STORAGE_PREFIX = "tgan.inspector.tab.";

export type InspectorTabOption<Id extends string = string> = {
  id: Id;
  label: string;
  icon?: ReactNode;
  badge?: ReactNode;
};

type InspectorTabsProps<Id extends string> = {
  storageId: string;
  tabs: ReadonlyArray<InspectorTabOption<Id>>;
  value: Id;
  onChange: (id: Id) => void;
  ariaLabel?: string;
};

export function InspectorTabs<Id extends string>({
  storageId,
  tabs,
  value,
  onChange,
  ariaLabel,
}: InspectorTabsProps<Id>) {
  return (
    <div
      className="inspector-tabs"
      role="tablist"
      aria-label={ariaLabel ?? "Inspector tabs"}
      data-storage-id={storageId}
    >
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={`inspector-tabs__tab ${active ? "is-active" : ""}`}
            onClick={() => onChange(tab.id)}
            title={tab.label}
          >
            {tab.icon && <span className="inspector-tabs__icon" aria-hidden="true">{tab.icon}</span>}
            <span className="inspector-tabs__label">{tab.label}</span>
            {tab.badge !== undefined && tab.badge !== null && (
              <span className="inspector-tabs__badge">{tab.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function useInspectorTab<Id extends string>(
  storageId: string,
  available: ReadonlyArray<Id>,
  fallback: Id,
): [Id, (id: Id) => void] {
  const storageKey = `${STORAGE_PREFIX}${storageId}`;
  const [value, setValue] = useState<Id>(() => {
    if (typeof window === "undefined") return fallback;
    const stored = window.localStorage.getItem(storageKey) as Id | null;
    if (stored && available.includes(stored)) return stored;
    return fallback;
  });
  useEffect(() => {
    if (!available.includes(value)) setValue(fallback);
  }, [available, fallback, value]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(storageKey, value);
  }, [storageKey, value]);
  return [value, setValue];
}
