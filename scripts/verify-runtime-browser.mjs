import path from "node:path";
import process from "node:process";
import { RUNTIME_BROWSER_CASES, verifyRuntimeBrowsers } from "./lib/runtime-browser-verification.mjs";

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--list") {
  for (const browser of RUNTIME_BROWSER_CASES) {
    const environment = Object.entries(browser.environment).map(([key, value]) => `${key}=${value}`).join(" ");
    console.log(`${browser.name}: ${browser.config}${environment ? ` (${environment})` : ""}`);
  }
} else if (args.length) {
  console.error("Usage: npm run test:runtime-browser -- [--list]");
  process.exitCode = 1;
} else {
  const abort = new AbortController();
  const interrupt = (signal) => abort.abort(signal);
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  try {
    await verifyRuntimeBrowsers({ root: path.resolve(import.meta.dirname, ".."), signal: abort.signal });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = abort.signal.reason === "SIGINT" ? 130 : abort.signal.reason === "SIGTERM" ? 143 : 1;
  } finally {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", interrupt);
  }
}
