import { readJsonBody, sendError, sendJson } from "../lib/http.mjs";
import { readModelImportDocument, writeModelImportDocument } from "../lib/model-imports.mjs";
import { DocumentConflictError } from "../lib/json-document-store.mjs";

const DEFAULT_DEPENDENCIES = Object.freeze({
  readModelImportDocument,
  writeModelImportDocument,
});

export async function handleAssetImportRoute(req, res, port, dependencies = DEFAULT_DEPENDENCIES) {
  try {
    const url = new URL(req.url || "", `http://127.0.0.1:${port}`);
    const filename = url.searchParams.get("filename");
    if (!filename) throw new Error("Missing ?filename=");

    if (req.method === "GET") {
      res.setHeader("Cache-Control", "no-store, max-age=0");
      sendJson(res, 200, { status: "ok", import: await dependencies.readModelImportDocument(filename) });
      return;
    }

    if (req.method === "PUT") {
      const body = await readJsonBody(req, 256 * 1024);
      if (typeof body.baseRevision !== "string") {
        throw new Error("Model import writes require a baseRevision string");
      }
      sendJson(res, 200, {
        status: "ok",
        import: await dependencies.writeModelImportDocument(
          filename,
          body.settings ?? {},
          body.baseRevision,
        ),
      });
      return;
    }

    sendJson(res, 405, { status: "error", message: "Method not allowed" });
  } catch (error) {
    if (error instanceof DocumentConflictError) {
      sendJson(res, 409, {
        status: "conflict",
        message: error.message,
        expectedRevision: error.expectedRevision,
        actualRevision: error.actualRevision,
      });
      return;
    }
    sendError(res, 400, error);
  }
}
