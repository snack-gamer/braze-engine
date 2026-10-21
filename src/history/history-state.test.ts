import { describe, expect, it } from "vitest";
import {
  beginHistoryTransaction,
  createHistoryState,
  endHistoryTransaction,
  redoHistoryState,
  undoHistoryState,
  updateHistoryState,
} from "./history-state";

describe("transactional history", () => {
  it("records ordinary updates as separate undo entries", () => {
    let history = createHistoryState(0);
    history = updateHistoryState(history, 1, 100);
    history = updateHistoryState(history, 2, 100);

    expect(history.past).toEqual([0, 1]);
    expect(undoHistoryState(history, 100).present).toBe(1);
  });

  it("coalesces a continuous repeat sequence into one undo checkpoint", () => {
    let history = createHistoryState(10);
    history = beginHistoryTransaction(history);
    history = updateHistoryState(history, (value) => value + 1, 100);
    history = updateHistoryState(history, (value) => value + 1, 100);
    history = updateHistoryState(history, (value) => value + 1, 100);
    history = endHistoryTransaction(history, 100);

    expect(history.past).toEqual([10]);
    expect(history.present).toBe(13);
    expect(history.future).toEqual([]);

    const undone = undoHistoryState(history, 100);
    expect(undone.present).toBe(10);
    expect(redoHistoryState(undone, 100).present).toBe(13);
  });

  it("treats repeated begin calls as one transaction", () => {
    let history = createHistoryState("before");
    history = beginHistoryTransaction(history);
    history = beginHistoryTransaction(history);
    history = updateHistoryState(history, "after", 100);
    history = endHistoryTransaction(history, 100);

    expect(history.past).toEqual(["before"]);
  });

  it("commits an interrupted interaction before undoing it", () => {
    let history = createHistoryState("before");
    history = beginHistoryTransaction(history);
    history = updateHistoryState(history, "latest", 100);

    const undone = undoHistoryState(history, 100);
    expect(undone.present).toBe("before");
    expect(undone.future).toEqual(["latest"]);
  });

  it("restores the redo branch when an interaction returns to its baseline", () => {
    let history = createHistoryState(1);
    history = updateHistoryState(history, 2, 100);
    history = undoHistoryState(history, 100);
    const baseline = history;

    history = beginHistoryTransaction(history);
    history = updateHistoryState(history, 3, 100);
    history = updateHistoryState(history, 1, 100);
    history = endHistoryTransaction(history, 100);

    expect(history).toEqual(baseline);
    expect(redoHistoryState(history, 100).present).toBe(2);
  });

  it("applies the history limit once per completed transaction", () => {
    let history = createHistoryState(0);
    history = updateHistoryState(history, 1, 2);
    history = updateHistoryState(history, 2, 2);
    history = beginHistoryTransaction(history);
    history = updateHistoryState(history, 3, 2);
    history = updateHistoryState(history, 4, 2);
    history = endHistoryTransaction(history, 2);

    expect(history.past).toEqual([1, 2]);
  });
});
