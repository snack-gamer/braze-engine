import { refreshAssetDatabase } from "../lib/assets/asset-database-store.mjs";
import { sendError, sendJson } from "../lib/http.mjs";

export { refreshAssetDatabase };

const DEFAULT_DEPENDENCIES = Object.freeze({ refreshAssetDatabase, eventHub: null });

export async function handleAssetDatabaseRoute(req, res, port, dependencies = DEFAULT_DEPENDENCIES) {
  try {
    const url = new URL(req.url || "", `http://127.0.0.1:${port}`);
    const pathname = url.pathname;

    if (req.method === "GET" && pathname === "/api/asset-database/events") {
      if (!dependencies.eventHub) {
        sendJson(res, 503, { status: "error", message: "Asset change events are unavailable" });
        return;
      }
      dependencies.eventHub.subscribe(req, res);
      return;
    }

    if (req.method === "POST" && pathname === "/api/asset-database/refresh") {
      sendJson(res, 200, { status: "ok", database: await dependencies.refreshAssetDatabase() });
      return;
    }

    if (req.method === "GET" && pathname === "/api/asset-database/tree") {
      sendJson(res, 200, { status: "ok", database: await dependencies.refreshAssetDatabase() });
      return;
    }

    if (req.method === "GET" && pathname.startsWith("/api/asset-database/assets/")) {
      const guid = pathname.slice("/api/asset-database/assets/".length).toLowerCase();
      const database = await dependencies.refreshAssetDatabase();
      const asset = database.records.find((record) => record.guid === guid);
      if (!asset) {
        sendJson(res, 404, { status: "error", message: "asset not found" });
        return;
      }
      sendJson(res, 200, { status: "ok", asset });
      return;
    }

    sendJson(res, 404, { status: "error", message: "Asset Database route not found" });
  } catch (error) {
    sendError(res, 400, error);
  }
}
