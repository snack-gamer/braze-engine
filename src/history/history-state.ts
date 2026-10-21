export type HistoryUpdater<T> = T | ((previous: T) => T);

export type HistoryState<T> = {
  past: T[];
  present: T;
  future: T[];
};

type HistoryTransaction<T> = {
  baseline: HistoryState<T>;
};

export type TransactionalHistoryState<T> = HistoryState<T> & {
  transaction: HistoryTransaction<T> | null;
};

export function createHistoryState<T>(present: T): TransactionalHistoryState<T> {
  return { past: [], present, future: [], transaction: null };
}

function appendCheckpoint<T>(past: T[], checkpoint: T, maxLength: number): T[] {
  const limit = Math.max(0, Math.floor(maxLength));
  if (limit === 0) return [];
  const next = [...past, checkpoint];
  return next.length > limit ? next.slice(-limit) : next;
}

export function updateHistoryState<T>(
  current: TransactionalHistoryState<T>,
  updater: HistoryUpdater<T>,
  maxLength: number,
): TransactionalHistoryState<T> {
  const next = typeof updater === "function"
    ? (updater as (previous: T) => T)(current.present)
    : updater;
  if (Object.is(next, current.present)) return current;
  if (current.transaction) {
    return { ...current, present: next, future: [] };
  }
  return {
    past: appendCheckpoint(current.past, current.present, maxLength),
    present: next,
    future: [],
    transaction: null,
  };
}

export function beginHistoryTransaction<T>(
  current: TransactionalHistoryState<T>,
): TransactionalHistoryState<T> {
  if (current.transaction) return current;
  return {
    ...current,
    transaction: {
      baseline: {
        past: current.past,
        present: current.present,
        future: current.future,
      },
    },
  };
}

export function endHistoryTransaction<T>(
  current: TransactionalHistoryState<T>,
  maxLength: number,
): TransactionalHistoryState<T> {
  const baseline = current.transaction?.baseline;
  if (!baseline) return current;
  if (Object.is(current.present, baseline.present)) {
    return { ...baseline, transaction: null };
  }
  return {
    past: appendCheckpoint(baseline.past, baseline.present, maxLength),
    present: current.present,
    future: [],
    transaction: null,
  };
}

export function undoHistoryState<T>(
  current: TransactionalHistoryState<T>,
  maxLength: number,
): TransactionalHistoryState<T> {
  const committed = endHistoryTransaction(current, maxLength);
  if (committed.past.length === 0) return committed;
  const previous = committed.past[committed.past.length - 1];
  return {
    past: committed.past.slice(0, -1),
    present: previous,
    future: [committed.present, ...committed.future],
    transaction: null,
  };
}

export function redoHistoryState<T>(
  current: TransactionalHistoryState<T>,
  maxLength: number,
): TransactionalHistoryState<T> {
  const committed = endHistoryTransaction(current, maxLength);
  if (committed.future.length === 0) return committed;
  const next = committed.future[0];
  return {
    past: appendCheckpoint(committed.past, committed.present, maxLength),
    present: next,
    future: committed.future.slice(1),
    transaction: null,
  };
}

export function restoreHistoryState<T>(snapshot: HistoryState<T>): TransactionalHistoryState<T> {
  return { ...snapshot, transaction: null };
}

export function captureHistoryState<T>(
  current: TransactionalHistoryState<T>,
  maxLength: number,
): HistoryState<T> {
  const { past, present, future } = endHistoryTransaction(current, maxLength);
  return { past, present, future };
}
