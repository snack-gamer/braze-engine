import { createContext, useContext, useMemo, type ReactNode } from "react";

export type HistoryTransactionController = {
  beginTransaction: () => void;
  endTransaction: () => void;
};

const noTransaction: HistoryTransactionController = {
  beginTransaction: () => undefined,
  endTransaction: () => undefined,
};

const HistoryTransactionContext = createContext<HistoryTransactionController>(noTransaction);

type HistoryTransactionProviderProps = HistoryTransactionController & {
  children: ReactNode;
};

export function HistoryTransactionProvider({
  beginTransaction,
  endTransaction,
  children,
}: HistoryTransactionProviderProps) {
  const controller = useMemo(
    () => ({ beginTransaction, endTransaction }),
    [beginTransaction, endTransaction],
  );
  return (
    <HistoryTransactionContext.Provider value={controller}>
      {children}
    </HistoryTransactionContext.Provider>
  );
}

export function useHistoryTransactionController(): HistoryTransactionController {
  return useContext(HistoryTransactionContext);
}
