import { EditorIcon } from "../../ui/EditorIcon";
import type { EditorIconName } from "../../ui/icons";

type PreviewUnavailableProps = Readonly<{
  kind: string;
  icon: EditorIconName;
  message?: string;
}>;

/** Stable dark fallback shared by preview types with invalid or unsupported source data. */
export function PreviewUnavailable({ kind, icon, message = "Preview unavailable" }: PreviewUnavailableProps) {
  return (
    <div
      className="asset-inspector__preview asset-inspector__preview--failed"
      data-subasset-preview-kind={kind}
      data-preview-status="failed"
      role="status"
    >
      <span className="asset-inspector__preview-placeholder">
        <EditorIcon name={icon} size="preview" />
        <span>{message}</span>
      </span>
    </div>
  );
}
