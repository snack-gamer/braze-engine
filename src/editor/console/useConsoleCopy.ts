import { useCallback, useEffect, useRef, useState } from "react";
import type { CollapsedConsoleEntry } from "./console-collapse";
import { formatConsoleCopy } from "./console-copy-text";

/** Owns clipboard feedback; late writes cannot update a closed Console. */
export function useConsoleCopy() {
  const generation = useRef(0);
  const [feedback, setFeedback] = useState("");
  useEffect(() => () => { generation.current += 1; }, []);
  const copy = useCallback(async (rows: readonly CollapsedConsoleEntry[]) => {
    if (rows.length === 0) return;
    const request = ++generation.current;
    setFeedback("Copying…");
    try {
      await navigator.clipboard.writeText(formatConsoleCopy(rows));
      if (request === generation.current) setFeedback(`Copied ${rows.length} ${rows.length === 1 ? "message" : "messages"}.`);
    } catch {
      if (request === generation.current) setFeedback("Copy failed. Select text in the message details and copy manually.");
    }
  }, []);
  return { copy, feedback };
}
