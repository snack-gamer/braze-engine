import { EditorIcon } from "../../ui/EditorIcon";
import type { CharacterValidationMetadata } from "../domain/diagnostics";

type AvatarConfiguratorHeaderProps = Readonly<{
  assetName: string;
  mode: "humanoid" | "generic";
  validationStatus: CharacterValidationMetadata["status"];
  onClose: () => void;
}>;

/** Identifies the full-workspace import context and owns its top-level exit action. */
export function AvatarConfiguratorHeader({
  assetName,
  mode,
  validationStatus,
  onClose,
}: AvatarConfiguratorHeaderProps) {
  return (
    <header className="avatar-configurator__header">
      <span className="avatar-configurator__title">
        <span className="avatar-configurator__title-icon" aria-hidden="true">
          <EditorIcon name="avatar" size="control" />
        </span>
        <span className="avatar-configurator__title-copy">
          <small className="avatar-configurator__eyebrow">
            <span>Model Import</span><i>/</i><span>{mode === "humanoid" ? "Humanoid Rig" : "Generic Rig"}</span>
          </small>
          <span className="avatar-configurator__headline">
            <strong id="avatar-configurator-title">{mode === "humanoid" ? "Avatar Configuration" : "Rig Configuration"}</strong>
            <small className="avatar-configurator__asset-name">
              <EditorIcon name="assetModel" size="compact" /> {assetName}
            </small>
          </span>
        </span>
      </span>
      <span className="avatar-configurator__header-actions">
        <span className={`avatar-configurator__validation avatar-configurator__validation--${validationStatus}`}>
          <EditorIcon name={validationStatus === "invalid" ? "warning" : "check"} size="compact" />
          {validationStatus === "invalid" ? "Needs attention" : validationStatus === "warning" ? "Valid with warnings" : "Valid"}
        </span>
        <i className="avatar-configurator__header-divider" aria-hidden="true" />
        <button type="button" className="ghost-button compact" onClick={onClose} title="Back to Model Inspector">
          <EditorIcon name="close" size="compact" /> Close
        </button>
      </span>
    </header>
  );
}
