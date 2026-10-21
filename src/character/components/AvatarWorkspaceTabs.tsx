import "./AvatarWorkspaceTabs.css";

export type AvatarWorkspaceTab = "mapping" | "settings" | "preview";

type AvatarWorkspaceTabsProps = Readonly<{
  activeTab: AvatarWorkspaceTab;
  humanoid: boolean;
  onChange: (tab: AvatarWorkspaceTab) => void;
}>;

/** Switches the right-hand Avatar workspace without displacing the source skeleton hierarchy. */
export function AvatarWorkspaceTabs({ activeTab, humanoid, onChange }: AvatarWorkspaceTabsProps) {
  const tabs: ReadonlyArray<Readonly<{ id: AvatarWorkspaceTab; label: string }>> = humanoid
    ? [
      { id: "mapping", label: "Mapping" },
      { id: "settings", label: "Muscles & Settings" },
      { id: "preview", label: "3D Preview" },
    ]
    : [
      { id: "settings", label: "Rig Settings" },
      { id: "preview", label: "3D Preview" },
    ];
  return (
    <div className="avatar-workspace-tabs" role="tablist" aria-label="Avatar configuration mode">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
