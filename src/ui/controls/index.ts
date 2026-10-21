/**
 * Public editor-control API.
 *
 * Existing Inspector* names remain the implementation/compatibility layer
 * while feature code migrates. New panes should import these semantic names
 * from `ui` so control ownership no longer follows a particular dock.
 */
export { EditorCheckbox, type EditorCheckboxProps } from "./EditorCheckbox";
export { EditorRange, type EditorRangeProps } from "./EditorRange";
export { InspectorColor as EditorColorField } from "../../components/InspectorColor";
export { InspectorGrid as EditorPropertyGrid } from "../../components/InspectorGrid";
export { InspectorGroup as EditorControlGroup } from "../../components/InspectorGroup";
export { InspectorNumberInput as EditorNumberField } from "../../components/InspectorNumberInput";
export { InspectorObjectField as EditorObjectField } from "../../components/InspectorObjectField";
export { InspectorPresetGrid as EditorPresetGrid } from "../../components/InspectorPresetGrid";
export { InspectorRow as EditorPropertyRow } from "../../components/InspectorRow";
export { InspectorSegmented as EditorSegmentedControl } from "../../components/InspectorSegmented";
export { InspectorSlider as EditorSlider } from "../../components/InspectorSlider";
export { InspectorTabs as EditorTabs, useInspectorTab as useEditorTab } from "../../components/InspectorTabs";
export { InspectorToggle as EditorToggle } from "../../components/InspectorToggle";
export { VectorField as EditorVectorField } from "../../components/VectorField";
