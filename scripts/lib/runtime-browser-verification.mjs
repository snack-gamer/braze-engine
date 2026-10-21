import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

const browserCase = (name, config, environment = {}) => Object.freeze({ name, config, environment: Object.freeze(environment) });

export const RUNTIME_BROWSER_CASES = Object.freeze([
  browserCase("Gameplay", "playwright.gameplay.config.ts"),
  browserCase("Registered behaviors", "playwright.behaviors.config.ts"),
  browserCase("JavaScript project classes and static export", "playwright.scripting.config.mjs"),
  browserCase("MCP agent authoring and playable output", "playwright.mcp.config.mjs"),
  browserCase("Responsive game UI and static export", "playwright.ui.config.mjs"),
  browserCase("Authored destruction with physics", "playwright.destruction.config.ts"),
  browserCase("Authored destruction without physics", "playwright.destruction.config.ts", { BRAZE_DESTRUCTION_WITHOUT_PHYSICS: "1" }),
  browserCase("World animation with physics", "playwright.animation-world.config.ts"),
  browserCase("World animation without physics", "playwright.animation-world.config.ts", { BRAZE_ANIMATION_WITHOUT_PHYSICS: "1" }),
  browserCase("glTF models with physics", "playwright.models.config.ts", { BRAZE_MODELS_FORMAT: "gltf" }),
  browserCase("GLB models without physics", "playwright.models.config.ts", { BRAZE_MODELS_FORMAT: "glb", BRAZE_MODELS_WITHOUT_PHYSICS: "1" }),
  browserCase("Skinned runtime prefab animation without physics", "playwright.runtime-animation.config.ts"),
  browserCase("Skinned runtime prefab animation with physics", "playwright.runtime-animation.config.ts", { BRAZE_RUNTIME_ANIMATION_WITH_PHYSICS: "1" }),
  browserCase("Input Action Map authoring and static export", "playwright.input-assets.config.ts"),
  browserCase("Runtime capsule characters and root motion", "playwright.runtime-characters.config.ts"),
  browserCase("First-person saved stock controls", "playwright.stock-controls.config.ts", { BRAZE_STOCK_CONTROLS_STYLE: "first-person" }),
  browserCase("Third-person saved stock controls", "playwright.stock-controls.config.ts", { BRAZE_STOCK_CONTROLS_STYLE: "third-person" }),
  browserCase("Top-down saved stock controls", "playwright.stock-controls.config.ts", { BRAZE_STOCK_CONTROLS_STYLE: "top-down" }),
  browserCase("Scripted stock control replacement and pools", "playwright.stock-controls.config.ts", { BRAZE_STOCK_CONTROLS_SCRIPTED: "1" }),
]);

const fixtureOverrides = [
  "BRAZE_PROJECT_ROOT", "BRAZE_PLAYWRIGHT_PROJECT_ROOT", "BRAZE_DESTRUCTION_WITHOUT_PHYSICS",
  "BRAZE_ANIMATION_WITHOUT_PHYSICS", "BRAZE_MODELS_WITHOUT_PHYSICS", "BRAZE_MODELS_FORMAT",
  "BRAZE_RUNTIME_ANIMATION_WITH_PHYSICS",
  "BRAZE_STOCK_CONTROLS_STYLE", "BRAZE_STOCK_CONTROLS_SCRIPTED",
];

function runBrowserCase(browser, { root, env, signal, spawnProcess }) {
  return new Promise((resolve, reject) => {
    const childEnv = { ...env };
    for (const key of fixtureOverrides) delete childEnv[key];
    Object.assign(childEnv, browser.environment);
    // Playwright owns server cleanup. A separate Unix group avoids delivering terminal Ctrl-C twice.
    const child = spawnProcess(process.execPath, [path.join(root, "node_modules/playwright/cli.js"), "test", "--config", browser.config], {
      cwd: root, env: childEnv, stdio: "inherit", detached: process.platform !== "win32",
    });
    const interrupt = () => child.kill(signal.reason === "SIGINT" ? "SIGINT" : "SIGTERM");
    const cleanup = () => signal?.removeEventListener("abort", interrupt);
    child.once("error", (error) => { cleanup(); reject(new Error(`${browser.name}: could not start Playwright.`, { cause: error })); });
    child.once("close", (code, termination) => {
      cleanup();
      if (signal?.aborted) reject(new Error(`${browser.name}: runtime browser verification interrupted.`));
      else if (code !== 0) reject(new Error(`${browser.name}: Playwright ${termination ? `terminated by ${termination}` : `exited with code ${code}`}.`));
      else resolve();
    });
    signal?.addEventListener("abort", interrupt, { once: true });
    if (signal?.aborted) interrupt();
  });
}

/** Shared HTTP/HMR ports and player output require each suite's teardown to finish before the next starts. */
export async function verifyRuntimeBrowsers({ root, env = process.env, signal, spawnProcess = spawn, report = console.log }) {
  for (const browser of RUNTIME_BROWSER_CASES) {
    if (signal?.aborted) throw new Error("Runtime browser verification interrupted.");
    report(`[runtime-browser] ${browser.name}`);
    await runBrowserCase(browser, { root, env, signal, spawnProcess });
  }
}
