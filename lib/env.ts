import { existsSync, readFileSync } from "node:fs";

/**
 * Loads .env then .env.local for standalone scripts.
 * Next.js already does this for the app. Existing shell variables win.
 * Values are never printed.
 */
export function loadLocalEnv() {
  const merged = new Map<string, string>();
  readEnvFile(".env", merged);
  readEnvFile(".env.local", merged);
  for (const [key, value] of merged) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function readEnvFile(path: string, into: Map<string, string>) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) into.set(key, value);
  }
}
