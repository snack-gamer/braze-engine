import { installServerShutdown } from "./lib/server-shutdown.mjs";
import { createAutomationRoute } from "./routes/automation.mjs";
import http from "node:http";
import process from "node:process";
import { createServer } from "vite";
import { ROOT } from "./lib/paths.mjs";
import {
  handleAssetDelete,
  handleAssetDuplicate,
  handleAssetFolder,
  handleAssetList,
  handleAssetMove,
  handleAssetReveal,
  handleAssetUpload,
} from "./routes/assets.mjs";
import { handleInputActionMapRoute } from "./routes/input-action-maps.mjs";
import { handlePrefabRoute } from "./routes/prefabs.mjs";
import { handleAssetImportRoute } from "./routes/asset-imports.mjs";
import { handleAssetDatabaseRoute } from "./routes/asset-database.mjs";
import { refreshAssetDatabase } from "./lib/assets/asset-database-store.mjs";
import { createAssetDatabaseEventHub } from "./lib/assets/asset-database-event-hub.mjs";
import { createAssetSourceWatcher } from "./lib/assets/asset-source-watcher.mjs";
import {
  handleHdriDelete,
  handleHdriDuplicate,
  handleHdriList,
  handleHdriReveal,
  handleHdriUpload,
} from "./routes/hdri.mjs";
import { handleProjectRoute } from "./routes/project.mjs";
import { handleEntityTagUsage } from "./routes/entity-tags.mjs";
import { serveAssetFile, serveHdriFile } from "./routes/files.mjs";
import { handleScenesRoute } from "./routes/scenes.mjs";
import { sendError } from "./lib/http.mjs";
import { ASSETS_ROOT } from "./lib/paths.mjs";

const port = Number(process.env.PORT || process.env.VITE_PORT || 5173);
const hmrPort = Number(process.env.VITE_HMR_PORT || port + 20000);
const assetEvents = createAssetDatabaseEventHub();
let assetWatcher = { dispose: () => undefined };
try {
  assetWatcher = await createAssetSourceWatcher({
    root: ASSETS_ROOT,
    onInvalidated: async (changedPaths) => {
      const database = await refreshAssetDatabase();
      assetEvents.publish({ changedPaths, generatedAt: database.generatedAt });
    },
    onError: (error) => console.error("[asset-database:watch-failed]", error),
  });
} catch (error) {
  console.error("[asset-database:watch-unavailable] Manual Project refresh remains available.", error);
}

const vite = await createServer({
  root: ROOT,
  appType: "spa",
  server: {
    middlewareMode: true,
    host: "127.0.0.1",
    ws: {
      host: "127.0.0.1",
      port: hmrPort,
      clientPort: hmrPort,
    },
  },
});

const handleAutomation = createAutomationRoute({
  loadPrefabAuthoring: () => vite.ssrLoadModule("/src/prefabs/authoring/prefab-commands.ts"),
  loadAuthoring: () => vite.ssrLoadModule("/src/automation/application/scene-commands.ts"),
  loadCapabilities: async () => (await vite.ssrLoadModule("/src/automation/domain/capabilities.ts")).automationCapabilities,
});

async function handleRequest(req, res) {
  const url = req.url || "";

  if (url.startsWith("/api/automation/")) {
    await handleAutomation(req, res, new URL(url, `http://127.0.0.1:${port}`).pathname);
    return;
  }

  if (url.startsWith("/3d-models/")) {
    serveAssetFile(req, res, port);
    return;
  }

  if (url.startsWith("/hdri/")) {
    serveHdriFile(req, res, port);
    return;
  }

  if (url.startsWith("/api/hdri/duplicate")) {
    await handleHdriDuplicate(req, res, port);
    return;
  }

  if (url.startsWith("/api/hdri/reveal")) {
    handleHdriReveal(req, res, port);
    return;
  }

  if (url.startsWith("/api/hdri")) {
    if (req.method === "GET") {
      handleHdriList(req, res);
      return;
    }
    if (req.method === "DELETE") {
      await handleHdriDelete(req, res, port);
      return;
    }
    await handleHdriUpload(req, res, port);
    return;
  }

  if (url.startsWith("/api/assets/duplicate")) {
    await handleAssetDuplicate(req, res, port);
    return;
  }

  if (url.startsWith("/api/asset-database")) {
    await handleAssetDatabaseRoute(req, res, port, {
      refreshAssetDatabase,
      eventHub: assetEvents,
    });
    return;
  }

  if (url.startsWith("/api/assets/move")) {
    await handleAssetMove(req, res);
    return;
  }

  if (url.startsWith("/api/assets/folder")) {
    await handleAssetFolder(req, res);
    return;
  }

  if (url.startsWith("/api/assets/import-settings")) {
    await handleAssetImportRoute(req, res, port);
    return;
  }

  if (url.startsWith("/api/assets/reveal")) {
    handleAssetReveal(req, res, port);
    return;
  }

  if (url.startsWith("/api/assets/input-action-map")) {
    await handleInputActionMapRoute(req, res, port);
    return;
  }

  if (url.startsWith("/api/assets/prefab")) {
    await handlePrefabRoute(req, res, port);
    return;
  }

  if (url.startsWith("/api/assets")) {
    if (req.method === "GET") {
      await handleAssetList(req, res);
      return;
    }
    if (req.method === "DELETE") {
      await handleAssetDelete(req, res, port);
      return;
    }
    await handleAssetUpload(req, res, port);
    return;
  }

  if (url.startsWith("/api/scenes")) {
    const pathname = new URL(url, `http://127.0.0.1:${port}`).pathname;
    await handleScenesRoute(req, res, pathname);
    return;
  }

  if (url.startsWith("/api/project")) {
    await handleProjectRoute(req, res);
    return;
  }

  if (url === "/api/entity-tags/usage") {
    await handleEntityTagUsage(req, res);
    return;
  }

  vite.middlewares(req, res);
}

const server = http.createServer((req, res) => {
  void handleRequest(req, res).catch((error) => {
    console.error("[server:request-failed]", error);
    if (!res.headersSent) {
      sendError(res, 500, error);
    } else if (!res.writableEnded) {
      res.destroy(error instanceof Error ? error : undefined);
    }
  });
});

installServerShutdown(server, [() => assetWatcher.dispose(), () => assetEvents.close(), handleAutomation.dispose, () => vite.close()]);

server.listen(port, "127.0.0.1", () => {
  console.log(`  ➜  Local:   http://127.0.0.1:${port}/`);
});
