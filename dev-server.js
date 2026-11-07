const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");

const ROOT = __dirname;

function loadEnvFile() {
  const file = path.join(ROOT, ".env.local");
  if (!fs.existsSync(file)) return;
  const source = fs.readFileSync(file, "utf8");
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || match[1].startsWith("#") || process.env[match[1]] !== undefined) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "").trim();
    }
    process.env[match[1]] = value.replace(/\\n/g, "\n");
  }
}

loadEnvFile();

const routes = {
  "/api/config": require("./api/config"),
  "/api/health": require("./api/health"),
  "/api/notes": require("./api/notes"),
  "/api/files": require("./api/files"),
};
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function serveStatic(urlPath, res) {
  let decoded;
  try { decoded = decodeURIComponent(urlPath); }
  catch (error) { res.writeHead(400).end("Bad path"); return; }
  if (decoded === "/") decoded = "/index.html";
  if (decoded.startsWith("/api/") || decoded.includes("\\") || decoded.split("/").some((part) => part.startsWith("."))) {
    res.writeHead(404).end("Not found");
    return;
  }
  const absolute = path.resolve(ROOT, "." + decoded);
  if (!absolute.startsWith(ROOT + path.sep)) { res.writeHead(404).end("Not found"); return; }
  fs.stat(absolute, (error, stat) => {
    if (error || !stat.isFile()) { res.writeHead(404).end("Not found"); return; }
    const type = MIME[path.extname(absolute).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type, "X-Content-Type-Options": "nosniff" });
    fs.createReadStream(absolute).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  let parsed;
  try { parsed = new URL(req.url, `http://${req.headers.host || "localhost"}`); }
  catch (error) { res.writeHead(400).end("Bad URL"); return; }

  let pathname = parsed.pathname;
  const fileRoute = pathname.match(/^\/files\/([a-f0-9]{16}\.(?:txt|json|md))$/i);
  if (fileRoute) {
    pathname = "/api/files";
    parsed.searchParams.set("file", fileRoute[1]);
  }

  const handler = routes[pathname];
  if (!handler) return serveStatic(parsed.pathname, res);

  req.query = Object.fromEntries(parsed.searchParams.entries());
  try {
    await handler(req, res);
    if (!res.writableEnded && !res.headersSent) res.end();
  } catch (error) {
    console.error("API handler failed:", error.message);
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    if (!res.writableEnded) res.end(JSON.stringify({ error: "Internal server error" }));
  }
});

const port = Number(process.env.PORT || 3000);
server.listen(port, "0.0.0.0", () => {
  console.log(`PasteToLink dev server: http://localhost:${port}`);
  console.log("Database: " + (process.env.TURSO_DATABASE_URL || "not configured (copy .env.example to .env.local)"));
});
