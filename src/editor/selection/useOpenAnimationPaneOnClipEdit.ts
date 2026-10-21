import { useEffect } from "react";
import { subscribeAnimationClipEditor } from "../../animation/application/animation-clip-editor-channel";

/** Makes clip-edit requests visible even when Animation is closed or tabbed away. */
export function useOpenAnimationPaneOnClipEdit(openPane: (pane: "animation") => void): void {
  useEffect(() => subscribeAnimationClipEditor((request) => {
    if (request) openPane("animation");
  }), [openPane]);
}
