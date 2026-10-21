import { useCallback, useRef, useState } from "react";
import {
  beginHistoryTransaction,
  captureHistoryState,
  createHistoryState,
  endHistoryTransaction,
  redoHistoryState,
  restoreHistoryState,
  undoHistoryState,
  updateHistoryState,
  type HistoryState,
  type HistoryUpdater,
  type TransactionalHistoryState,
} from "../history/history-state";

export type { HistoryState } from "../history/history-state";

export function useHistory<T>(initial: T, maxLength = 100) {
  const [state, setState] = useState<TransactionalHistoryState<T>>(() => createHistoryState(initial));
  // Mirror the latest state so callers can capture it synchronously (e.g. to
  // snapshot before Play Mode) without threading it through a stale closure.
  const stateRef = useRef(state);
  stateRef.current = state;

  const set = useCallback(
    (updater: HistoryUpdater<T>) => {
      setState((current) => updateHistoryState(current, updater, maxLength));
    },
    [maxLength],
  );

  const undo = useCallback(() => {
    setState((current) => undoHistoryState(current, maxLength));
  }, [maxLength]);

  const redo = useCallback(() => {
    setState((current) => redoHistoryState(current, maxLength));
  }, [maxLength]);

  const reset = useCallback((next: T) => {
    setState(createHistoryState(next));
  }, []);

  const beginTransaction = useCallback(() => {
    setState(beginHistoryTransaction);
  }, []);

  const endTransaction = useCallback(() => {
    setState((current) => endHistoryTransaction(current, maxLength));
  }, [maxLength]);

  // Snapshot the full undo/redo state, and restore it wholesale later. Used to
  // make Play Mode non-destructive: capture on entry, restore on exit so edits
  // made during play are discarded *and* the pre-play undo/redo stack survives.
  const capture = useCallback(() => captureHistoryState(stateRef.current, maxLength), [maxLength]);
  const restore = useCallback((snapshot: HistoryState<T>) => {
    setState(restoreHistoryState(snapshot));
  }, []);

  return {
    state: state.present,
    set,
    undo,
    redo,
    reset,
    beginTransaction,
    endTransaction,
    capture,
    restore,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    historyDepth: state.past.length,
    redoDepth: state.future.length,
  };
}
