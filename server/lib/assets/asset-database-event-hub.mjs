/** Publishes asset-database invalidations to connected editor windows over SSE. */
export function createAssetDatabaseEventHub() {
  const clients = new Set();
  let sequence = 0;

  const publish = (event) => {
    sequence += 1;
    const payload = `id: ${sequence}\nevent: changed\ndata: ${JSON.stringify(event)}\n\n`;
    for (const response of clients) {
      try {
        response.write(payload);
      } catch {
        clients.delete(response);
      }
    }
  };

  const subscribe = (request, response) => {
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    response.write(`retry: 1000\nevent: ready\ndata: ${JSON.stringify({ sequence })}\n\n`);
    clients.add(response);
    request.on("close", () => clients.delete(response));
  };

  const close = () => {
    for (const response of clients) response.end();
    clients.clear();
  };

  return { close, publish, subscribe };
}
