import type { InputHTMLAttributes } from "react";
import { isContinuousAdjustmentKey, useHistoryInteraction } from "./useHistoryInteraction";

type TransactionalRangeInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  | "type"
  | "onPointerDown"
  | "onPointerUp"
  | "onPointerCancel"
  | "onLostPointerCapture"
  | "onKeyDown"
  | "onKeyUp"
  | "onBlur"
>;

/** Native range input that brackets pointer and keyboard adjustment sequences. */
export function TransactionalRangeInput(props: TransactionalRangeInputProps) {
  const interaction = useHistoryInteraction();
  return (
    <input
      {...props}
      type="range"
      onPointerDown={(event) => {
        if (event.button !== 0 || props.disabled) return;
        interaction.begin();
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        interaction.end();
      }}
      onPointerCancel={interaction.end}
      onLostPointerCapture={interaction.end}
      onKeyDown={(event) => {
        if (isContinuousAdjustmentKey(event.key)) interaction.begin();
      }}
      onKeyUp={(event) => {
        if (isContinuousAdjustmentKey(event.key)) interaction.end();
      }}
      onBlur={interaction.end}
    />
  );
}
