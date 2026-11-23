// mail-first-cms — M6 audit gate for CI / the Netlify build.
//
//   node scripts/audit-ci.mjs
//
// Serves the built `dist/` on localhost:3000, then runs the three audit gates
// (a11y / links / no-JS) against it. Exits non-zero if any gate fails, so the
// Netlify build command (`npm run build && npx playwright install chromium &&
// npm run audit:ci`) fails the deploy on a contrast regression, a broken
// internal link, or a page that stops working without JavaScript.
//
// The audits themselves honour AUDIT_BASE_URL (tools/audit/browser.mjs), so the
// same gates can also run against a live preview URL without this server.

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const DIST = fileURLToPath(new URL("../dist", import.meta.url));
const PORT = Number(process.env.AUDIT_PORT || 3000);
const BASE = `http://localhost:${PORT}`;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
};

// Map a request path to a file on disk, mirroring Astro's `format: 'directory'`
// output: "/" -> index.html, "/events" or "/events/" -> events/index.html, a
// path with an extension -> that file. Returns null for traversal attempts.
function resolve(urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0]);
  const rel = normalize(clean).replace(/^(\.\.(\/|\\|$))+/, "");
  if (rel.includes("..")) return null;
  if (extname(rel)) return join(DIST, rel);
  return join(DIST, rel, "index.html");
}

const server = createServer(async (req, res) => {
  const file = resolve(req.url || "/");
  if (!file || !file.startsWith(DIST)) {
    res.writeHead(403).end("forbidden");
    return;
  }
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error("not a file");
    const body = await readFile(file);
    res.writeHead(200, {
      "Content-Type": MIME[extname(file)] || "application/octet-stream",
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("not found");
  }
});

function run(script) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], {
      stdio: "inherit",
      env: { ...process.env, AUDIT_BASE_URL: BASE },
    });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

await stat(DIST).catch(() => {
  console.error(`No dist/ at ${DIST} — run \`npm run build\` first.`);
  process.exit(1);
});

await new Promise((r) => server.listen(PORT, r));
console.log(`audit server serving dist/ on ${BASE}\n`);

const gates = [
  "tools/audit/a11y.mjs",
  "tools/audit/links.mjs",
  "tools/audit/nojs.mjs",
];
const failed = [];
for (const g of gates) {
  const code = await run(g);
  if (code !== 0) failed.push(g);
}

server.close();

if (failed.length) {
  console.error(`\n✗ audit gate FAILED: ${failed.join(", ")}`);
  process.exit(1);
}
console.log("\n✓ all audit gates passed");
