import { useState, type DragEvent } from "react";
import { extractHierarchyRows, HIERARCHY_ROWS_TYPE, HIERARCHY_ROW_TYPE } from "../../AssetBrowser/drag";
import {
  createMotionPulseTarget,
  normalizeMotionPulseComponent,
} from "../../../lib/motion-pulse";
import {
  assignMotionPulseTarget,
  changeMotionPulseAxisMode,
  patchMotionPulseTarget,
  removeMotionPulseTarget,
} from "../../../scene/authoring/motion-pulse-targets";
import type {
  MotionPulseAxisMode,
  MotionPulseComponent,
  SceneObject,
} from "../../../types";
import { EditorIcon } from "../../../ui/EditorIcon";
import { EditorCheckbox } from "../../../ui/controls";
import { useInspectorSectionOpen } from "../InspectorSection";
import { MotionPulseTargetEditor } from "./MotionPulseTargetEditor";
import { SceneComponentIdentity } from "../SceneComponentPresentation";

type MotionPulseEditorProps = {
  owner: SceneObject;
  objects: SceneObject[];
  component: MotionPulseComponent;
  updateObject: (id: string, patch: Partial<SceneObject>) => void;
};

const hasHierarchyDrag = (event: DragEvent<HTMLElement>) =>
  event.dataTransfer.types.includes(HIERARCHY_ROW_TYPE)
  || event.dataTransfer.types.includes(HIERARCHY_ROWS_TYPE);

export function MotionPulseEditor({ owner, objects, component, updateObject }: MotionPulseEditorProps) {
  const pulse = normalizeMotionPulseComponent(component);
  const targets = pulse.targets ?? [];
  const targetObjects = objects.filter((item) => item.primitive !== "camera");
  const targetById = new Map(targetObjects.map((item) => [item.id, item]));
  const [open, setOpen] = useInspectorSectionOpen("component.motionPulse", false);
  const [openTargets, setOpenTargets] = useState<Set<string>>(() => new Set());
  const [dragTargetId, setDragTargetId] = useState<string | null>(null);

  const patchPulse = (patch: Partial<MotionPulseComponent>) => {
    updateObject(owner.id, { motionPulse: { ...pulse, ...patch } });
  };
  const addTarget = () => {
    const nextTarget = createMotionPulseTarget(undefined, targets.length);
    setOpen(true);
    setOpenTargets((current) => new Set(current).add(nextTarget.id));
    patchPulse({ targets: [...targets, nextTarget] });
  };
  const removeTarget = (targetId: string) => {
    setOpenTargets((current) => {
      const next = new Set(current);
      next.delete(targetId);
      return next;
    });
    patchPulse({ targets: removeMotionPulseTarget(targets, targetId) });
  };
  const toggleTargetOpen = (targetId: string) => {
    setOpenTargets((current) => {
      const next = new Set(current);
      if (next.has(targetId)) next.delete(targetId);
      else next.add(targetId);
      return next;
    });
  };
  const handleTargetDragOver = (targetId: string, event: DragEvent<HTMLElement>) => {
    if (!hasHierarchyDrag(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragTargetId(targetId);
  };
  const handleTargetDrop = (targetId: string, event: DragEvent<HTMLElement>) => {
    if (!hasHierarchyDrag(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragTargetId(null);
    const objectId = extractHierarchyRows(event.dataTransfer).find((rowId) => targetById.has(rowId));
    const targetObject = objectId ? targetById.get(objectId) : null;
    if (targetObject) patchPulse({ targets: assignMotionPulseTarget(targets, targetId, targetObject) });
  };

  return (
    <div className="component-card motion-pulse-card">
      <div className="component-card__head">
        <button
          className="icon-button motion-pulse-disclosure"
          type="button"
          title={open ? "Collapse Motion Pulse" : "Expand Motion Pulse"}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <EditorIcon name={open ? "disclosureOpen" : "disclosureClosed"} size="control" />
        </button>
        <span className="component-card__title">
          <SceneComponentIdentity
            componentId="motionPulse"
            details={<small>{targets.length} target{targets.length === 1 ? "" : "s"}</small>}
          />
        </span>
        <div className="rail-actions">
          <label className="material-toggle">
            <EditorCheckbox
              checked={pulse.enabled !== false}
              onChange={(event) => patchPulse({ enabled: event.target.checked })}
            />
            <span>{pulse.enabled === false ? "Off" : "On"}</span>
          </label>
          <button
            className="icon-button danger"
            type="button"
            title="Remove component"
            onClick={() => updateObject(owner.id, { motionPulse: undefined })}
          >
            <EditorIcon name="delete" size="control" />
          </button>
        </div>
      </div>

      {open && (
        <>
          <div className="modifier-pins-heading">
            <span>Targets</span>
            <button className="ghost-button" type="button" onClick={addTarget}>
              <EditorIcon name="add" size="control" /> Add
            </button>
          </div>
          <div className="motion-pulse-target-list">
            {targets.map((target, index) => {
              const targetObject = target.objectId ? targetById.get(target.objectId) : null;
              const targetName = targetObject
                ? targetObject.name || targetObject.id
                : target.objectId ? "Missing object" : "";
              return (
                <MotionPulseTargetEditor
                  key={target.id}
                  target={target}
                  index={index}
                  targetName={targetName}
                  open={openTargets.has(target.id)}
                  dragging={dragTargetId === target.id}
                  toggleOpen={() => toggleTargetOpen(target.id)}
                  patchTarget={(patch) => patchPulse({
                    targets: patchMotionPulseTarget(targets, target.id, patch),
                  })}
                  changeAxisMode={(axisMode: MotionPulseAxisMode) => patchPulse({
                    targets: changeMotionPulseAxisMode(targets, target.id, axisMode),
                  })}
                  removeTarget={() => removeTarget(target.id)}
                  targetDragOver={(event) => handleTargetDragOver(target.id, event)}
                  targetDragLeave={(event) => {
                    const nextTarget = event.relatedTarget;
                    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
                    setDragTargetId((current) => current === target.id ? null : current);
                  }}
                  targetDrop={(event) => handleTargetDrop(target.id, event)}
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
