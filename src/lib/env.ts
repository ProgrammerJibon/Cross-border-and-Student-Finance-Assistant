import "server-only";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  const isProd = process.env.NODE_ENV === "production";
  const envFiles = isProd
    ? [".env.production.local", ".env.production", ".env.local", ".env"]
    : [".env.local", ".env.development.local", ".env.development", ".env", ".env.production"];

  for (const file of envFiles) {
    const fullPath = resolve(/*turbopackIgnore: true*/ process.cwd(), file);
    if (!existsSync(fullPath)) continue;

    try {
      const content = readFileSync(fullPath, "utf8");
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        let val = trimmed.slice(eq + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        // Only set if not already defined (higher-priority file wins)
        if (process.env[key] === undefined) {
          process.env[key] = val;
        }
      }
    } catch {
      // Ignore file read error and continue
    }
  }
}

loadEnv();
