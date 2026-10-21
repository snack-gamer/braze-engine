import { EditorIcon } from "../../ui/EditorIcon";
import type { EditorIconName } from "../../ui/icons";
import type { ReactNode } from "react";

type Props = Readonly<{
  className: string;
  icon: EditorIconName;
  visual?: ReactNode;
  iconClassName?: string;
  name: string;
  meta?: string;
  selected: boolean;
  focused: boolean;
  title?: string;
  dataKind?: string;
  dataGuid?: string;
  dataLocalId?: string;
  onClick: (event: React.MouseEvent) => void;
  onDoubleClick?: () => void;
  onDragStart?: (event: React.DragEvent) => void;
}>;

export function IconAssetTile(props: Props) {
  return (
    <div
      className={`asset-tile ${props.className} ${props.selected ? "selected" : ""} ${props.focused ? "focused" : ""}`}
      draggable={Boolean(props.onDragStart)}
      onDragStart={props.onDragStart}
      onClick={props.onClick}
      onDoubleClick={props.onDoubleClick}
      title={props.title}
      data-subasset-kind={props.dataKind}
      data-asset-guid={props.dataGuid}
      data-local-id={props.dataLocalId}
    >
      <span className={`model-tile__icon ${props.iconClassName ?? ""}`}>
        {props.visual ?? <EditorIcon name={props.icon} size="preview" />}
      </span>
      <span className="asset-tile__name">{props.name}</span>
      {props.meta && <span className="model-tile__meta">{props.meta}</span>}
    </div>
  );
}
