import type { DragEvent } from "react";
import {
  MOTION_PULSE_EASING_OPTIONS,
  MOTION_PULSE_MODE_OPTIONS,
} from "../../../lib/motion-pulse";
import type {
  MotionPulseAxisMode,
  MotionPulseEasing,
  MotionPulseMode,
  MotionPulseTarget,
} from "../../../types";
import { EditorIcon } from "../../../ui/EditorIcon";
import { EditorCheckbox } from "../../../ui/controls";
import { InspectorNumberInput } from "../../InspectorNumberInput";
import { InspectorRow } from "../../InspectorRow";
import { MotionPulseVectorEditor } from "./MotionPulseVectorEditor";

type MotionPulseTargetEditorProps = {
  target: MotionPulseTarget;
  index: number;
  targetName: string;
  open: boolean;
  dragging: boolean;
  toggleOpen: () => void;
  patchTarget: (patch: Partial<MotionPulseTarget>) => void;
  changeAxisMode: (axisMode: MotionPulseAxisMode) => void;
  removeTarget: () => void;
  targetDragOver: (event: DragEvent<HTMLElement>) => void;
  targetDragLeave: (event: DragEvent<HTMLElement>) => void;
  targetDrop: (event: DragEvent<HTMLElement>) => void;
};

export function MotionPulseTargetEditor(props: MotionPulseTargetEditorProps) {
  const { target } = props;
  return (
    <div className={`motion-pulse-target-card ${props.open ? "expanded" : ""}`}>
      <div className="motion-pulse-target-head">
        <button
          className="icon-button motion-pulse-disclosure"
          type="button"
          title={props.open ? "Collapse target" : "Expand target"}
          aria-expanded={props.open}
          onClick={props.toggleOpen}
        >
          <EditorIcon name={props.open ? "disclosureOpen" : "disclosureClosed"} size="control" />
        </button>
        <InspectorRow label="Target">
          <span
            className={`motion-pulse-target-drop ${props.dragging ? "dragging" : ""}`}
            onDragEnter={props.targetDragOver}
            onDragOver={props.targetDragOver}
            onDragLeave={props.targetDragLeave}
            onDrop={props.targetDrop}
          >
            <input type="text" readOnly value={props.targetName} placeholder={`Drop target ${props.index + 1}`} />
          </span>
        </InspectorRow>
        <label className="material-toggle">
          <EditorCheckbox
            checked={target.enabled !== false}
            onChange={(event) => props.patchTarget({ enabled: event.target.checked })}
          />
          <span>{target.enabled === false ? "Off" : "On"}</span>
        </label>
        <button
          className="icon-button danger"
          type="button"
          title="Remove target"
          onClick={props.removeTarget}
        >
          <EditorIcon name="delete" size="control" />
        </button>
      </div>

      {props.open && (
        <div className="motion-pulse-target-body">
          <InspectorRow label="Rate">
            <InspectorNumberInput
              value={target.rate}
              min={0} max={60} step={0.1} decimals={2}
              ariaLabel="Motion pulse rate"
              onChange={(rate) => props.patchTarget({ rate })}
            />
          </InspectorRow>
          <InspectorRow label="Phase">
            <InspectorNumberInput
              value={target.phase}
              min={-10} max={10} step={0.01} decimals={2}
              ariaLabel="Motion pulse phase"
              onChange={(phase) => props.patchTarget({ phase })}
            />
          </InspectorRow>
          <InspectorRow label="Mode">
            <select
              value={target.mode}
              onChange={(event) => props.patchTarget({ mode: event.target.value as MotionPulseMode })}
            >
              {MOTION_PULSE_MODE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </InspectorRow>
          <InspectorRow label="Easing">
            <select
              value={target.easing}
              onChange={(event) => props.patchTarget({ easing: event.target.value as MotionPulseEasing })}
            >
              {MOTION_PULSE_EASING_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </InspectorRow>
          <InspectorRow label="Axes">
            <select
              value={target.axisMode}
              onChange={(event) => props.changeAxisMode(event.target.value as MotionPulseAxisMode)}
            >
              <option value="individual">Individual</option>
              <option value="unified">Unified</option>
            </select>
          </InspectorRow>
          <MotionPulseVectorEditor
            label="Position"
            values={target.position}
            axisMode={target.axisMode}
            step={0.05}
            decimals={2}
            onChange={(position) => props.patchTarget({ position })}
          />
          <MotionPulseVectorEditor
            label="Rotation"
            values={target.rotation}
            axisMode={target.axisMode}
            step={0.01}
            decimals={2}
            unit="turn"
            onChange={(rotation) => props.patchTarget({ rotation })}
          />
          <MotionPulseVectorEditor
            label="Scale"
            values={target.scale}
            axisMode={target.axisMode}
            step={0.01}
            decimals={2}
            onChange={(scale) => props.patchTarget({ scale })}
          />
        </div>
      )}
    </div>
  );
}
