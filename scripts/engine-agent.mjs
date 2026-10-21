#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { createEngineCommandClient } from "./lib/engine-command-client.mjs";

const [command, filename] = process.argv.slice(2);
if (!command || command === "--help") {
  console.log("Usage: node scripts/engine-agent.mjs capabilities | request <file.json|->\nSet BRAZE_ENGINE_URL for a different local port. scene.edit previews unless apply:true. Requests are never automatically retried.");
} else {
  const client = createEngineCommandClient();
  const capabilities = await client.discover();
  let response;
  if (command === "capabilities") {
    console.log(JSON.stringify(capabilities, null, 2));
    process.exit(0);
  }
  else if (command === "request" && filename) {
    const text = filename === "-" ? await new Promise((resolve, reject) => {
      let input = ""; process.stdin.setEncoding("utf8"); process.stdin.on("data", (chunk) => { input += chunk; });
      process.stdin.on("end", () => resolve(input)); process.stdin.on("error", reject);
    }) : await readFile(filename, "utf8");
    const { operation, ...args } = JSON.parse(text);
    response = await client.execute(operation, args).catch((error) => {
      if (!error.envelope) throw error;
      process.exitCode = 1; return error.envelope;
    });
  } else throw new Error("Use capabilities or request <file.json|->.");
  console.log(JSON.stringify(response));
}
