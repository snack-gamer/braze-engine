#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const [command = "--help", output] = process.argv.slice(2);
if (command === "--help") {
  console.log("Usage: node scripts/engine-browser.mjs open | inspect | screenshot <path.png>\nBRAZE_ENGINE_URL selects the local engine; BRAZE_BROWSER_PORT defaults to 9339. This persistent browser stays open after each command.");
  process.exit(0);
}
if (!["open", "inspect", "screenshot"].includes(command)) throw new Error("Unknown browser operation.");
const url = new URL(process.env.BRAZE_ENGINE_URL || "http://127.0.0.1:5179");
if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Only a local engine URL is supported.");
const port = Number(process.env.BRAZE_BROWSER_PORT || 9339);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid browser control port.");
const endpoint = `http://127.0.0.1:${port}`;
const available = async () => fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(500) }).then((r) => r.ok).catch(() => false);
if (!await available()) {
  if (command !== "open") throw new Error("Run engine-browser.mjs open first.");
  const capabilities = await fetch(new URL("/api/automation/v1/capabilities", url), { signal: AbortSignal.timeout(5000) }).then((r) => r.json());
  if (capabilities.engine !== "braze") throw new Error("No Braze engine at this URL.");
  const macChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const executable = existsSync(macChrome) ? macChrome : chromium.executablePath();
  const profile = join(tmpdir(), `braze-live-browser-${port}`); await mkdir(profile, { recursive: true });
  const child = spawn(executable, [`--remote-debugging-port=${port}`, "--remote-debugging-address=127.0.0.1", `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", url.href], { detached: true, stdio: "ignore" });
  child.unref();
  const deadline = Date.now() + 10000;
  while (!await available()) { if (Date.now() > deadline) throw new Error("Browser did not start."); await new Promise((r) => setTimeout(r, 100)); }
}
const browser = await chromium.connectOverCDP(endpoint);
const context = browser.contexts()[0];
let page = context.pages().find((candidate) => candidate.url().startsWith(url.origin + "/"));
if (!page) {
  if (command !== "open") throw new Error("No page for the requested engine is open.");
  page = await context.newPage(); await page.goto(url.href);
}
if (command === "open") await page.bringToFront();
if (command === "screenshot") {
  if (!output) throw new Error("Specify a screenshot output path.");
  const destination = resolve(output); await page.screenshot({ path: destination }); console.log(destination);
} else console.log(JSON.stringify({ url: page.url(), title: await page.title(), sessionId: await page.locator("html").getAttribute("data-braze-editor-session"), controlPort: port }, null, 2));
// Disconnect this short-lived CDP client without closing the visible browser.
process.exit(0);
