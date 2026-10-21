/** The server owns its watchers, Vite and build children until all cleanup completes. */
export function installServerShutdown(server, cleanups) {
  let pending;
  const cleanup = () => pending ??= Promise.allSettled(cleanups.map((close) => Promise.resolve().then(close)));
  const stop = async () => {
    const timeout = setTimeout(() => process.exit(1), 5000); timeout.unref();
    server.close(); server.closeAllConnections();
    await cleanup(); clearTimeout(timeout); process.exit(0);
  };
  server.once('close', () => { void cleanup(); });
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
}
