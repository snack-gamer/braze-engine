import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const loadedKeys = new Set();

function stripQuotes(value) {
  const trimmed = value.trim();
  const quote = trimmed[0];
  if ((quote === '"' || quote === "'") && trimmed.endsWith(quote)) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseEnvLine(line) {
  const clean = line.trim();
  if (!clean || clean.startsWith("#")) return null;
  const normalized = clean.startsWith("export ") ? clean.slice("export ".length).trim() : clean;
  const equals = normalized.indexOf("=");
  if (equals <= 0) return null;
  const key = normalized.slice(0, equals).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;
  return [key, stripQuotes(normalized.slice(equals + 1))];
}

export function loadEnvFiles(root = process.cwd()) {
  for (const filename of [".env", ".env.local"]) {
    const filePath = path.join(root, filename);
    if (!existsSync(filePath)) continue;

    const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const entry = parseEnvLine(line);
      if (!entry) continue;
      const [key, value] = entry;
      if (process.env[key] !== undefined && !loadedKeys.has(key)) continue;
      process.env[key] = value;
      loadedKeys.add(key);
    }
  }
}

loadEnvFiles();
