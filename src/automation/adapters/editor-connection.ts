/** Browser connection owns transport only; the editor owns all commands and state. */
export function connectAutomationEditor(execute: (request: Record<string, unknown>) => Promise<unknown>) {
  const stream = new EventSource("/api/automation/v1/editor-events");
  let identity: { sessionId: string; token: string } | null = null;
  let disposed = false;
  stream.addEventListener("connected", (event) => { identity = JSON.parse((event as MessageEvent).data); document.documentElement.dataset.brazeEditorSession = identity!.sessionId; });
  stream.addEventListener("command", (event) => {
    const { commandId, request } = JSON.parse((event as MessageEvent).data);
    const owner = identity;
    if (!owner || disposed) return;
    void (async () => {
      let outcome: { result?: unknown; error?: string };
      try { outcome = { result: await execute(request) }; }
      catch (error) { outcome = { error: error instanceof Error ? error.message : String(error) }; }
      if (disposed || identity !== owner) return;
      await fetch("/api/automation/v1/editor-result", { method: "POST",
        headers: { "Content-Type": "application/json", "X-Braze-Automation": "1" },
        body: JSON.stringify({ ...owner, commandId, ...outcome }),
      }).catch(() => undefined); // The server reports disconnect/timeout; never replay an edit.
    })();
  });
  return () => { delete document.documentElement.dataset.brazeEditorSession; disposed = true; identity = null; stream.close(); };
}
