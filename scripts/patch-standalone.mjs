import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const serverPath = resolve(".next/standalone/server.js");
if (existsSync(serverPath)) {
  let content = readFileSync(serverPath, "utf8");
  const loaderSnippet = `// Auto-load .env.production, .env.local, or .env in standalone mode
try {
  const fs = require('node:fs');
  const path = require('node:path');
  for (const envName of ['.env.production', '.env.local', '.env']) {
    const envPath = path.resolve(__dirname, envName);
    if (fs.existsSync(envPath)) {
      if (typeof process.loadEnvFile === 'function') {
        try { process.loadEnvFile(envPath); break; } catch (e) {}
      }
      try {
        const lines = fs.readFileSync(envPath, 'utf8').split(/\\r?\\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eq = trimmed.indexOf('=');
          if (eq === -1) continue;
          const k = trimmed.slice(0, eq).trim();
          let v = trimmed.slice(eq + 1).trim();
          if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
            v = v.slice(1, -1);
          }
          if (process.env[k] === undefined || process.env[k] === '') {
            process.env[k] = v;
          }
        }
        break;
      } catch (e) {}
    }
  }
} catch (e) {}\n`;

  if (!content.includes("// Auto-load .env.production")) {
    content = loaderSnippet + content;
    writeFileSync(serverPath, content);
    console.log("Injected env loader into .next/standalone/server.js");
  }

  // Also create app.js as an alias to server.js in standalone directory for cPanel hosts defaulting to app.js
  const appPath = resolve(".next/standalone/app.js");
  writeFileSync(appPath, "require('./server.js');\n");
  console.log("Created .next/standalone/app.js launcher");
}

