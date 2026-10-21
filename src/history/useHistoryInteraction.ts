import { useCallback, useEffect, useRef } from "react";
import { useHistoryTransactionController } from "./HistoryTransactionContext";

/** Owns one control interaction and makes repeated begin/end signals idempotent. */
export function useHistoryInteraction(): { begin: () => void; end: () => void } {
  const transaction = useHistoryTransactionController();
  const activeRef = useRef(false);

  const begin = useCallback(() => {
    if (activeRef.current) return;
    activeRef.current = true;
    transaction.beginTransaction();
  }, [transaction]);

  const end = useCallback(() => {
    if (!activeRef.current) return;
    activeRef.current = false;
    transaction.endTransaction();
  }, [transaction]);

  useEffect(() => end, [end]);

  return { begin, end };
}

export function isContinuousAdjustmentKey(key: string): boolean {
  return key === "ArrowLeft"
    || key === "ArrowRight"
    || key === "ArrowUp"
    || key === "ArrowDown"
    || key === "PageUp"
    || key === "PageDown"
    || key === "Home"
    || key === "End";
}
