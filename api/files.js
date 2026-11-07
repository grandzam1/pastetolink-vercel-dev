const crypto = require("node:crypto");
const { env, publicConfig } = require("./_lib/config");
const { createFile, getFile, updateFile, deleteFile } = require("./_lib/database");
const { setCors, sendJson, readJson, hasWriteAccess, preflight } = require("./_lib/http");

const TYPES = {
  txt: "text/plain; charset=utf-8",
  json: "application/json; charset=utf-8",
  md: "text/markdown; charset=utf-8",
};
const MAX_BYTES = Math.max(1024, Number(env("MAX_FILE_BYTES", "262144")) || 262144);

function queryValue(value) { return Array.isArray(value) ? value[0] : value; }

function parseFileRef(value) {
  const match = String(value || "").match(/^([a-f0-9]{16})\.(txt|json|md)$/i);
  return match ? { id: match[1].toLowerCase(), ext: match[2].toLowerCase() } : null;
}

function urlFor(req, ref) {
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  const proto = String(req.headers["x-forwarded-proto"] || (host.startsWith("localhost") ? "http" : "https"))
    .split(",")[0].trim();
  return host ? `${proto}://${host}/files/${ref.id}.${ref.ext}` : `/files/${ref.id}.${ref.ext}`;
}

function publicHeaders(res, ext, filename) {
  setCors(res);
  res.setHeader("Content-Type", TYPES[ext]);
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

function validateContent(content, ext) {
  if (typeof content !== "string") return "Content must be a string";
  if (Buffer.byteLength(content, "utf8") > MAX_BYTES) return `Content exceeds the ${MAX_BYTES}-byte limit`;
  if (ext === "json") {
    try { JSON.parse(content); } catch (error) { return "Content is not valid JSON"; }
  }
  return "";
}

function unavailable(res) {
  return sendJson(res, 503, { error: "Database is not configured or unavailable" });
}

module.exports = async function handler(req, res) {
  if (preflight(req, res)) return;
  if (!publicConfig().FILES_ENABLED) return unavailable(res);
  const ref = parseFileRef(queryValue(req.query && req.query.file));

  if (req.method === "GET") {
    if (!ref) return sendJson(res, 400, { error: "Use /files/{id}.{txt|json|md}" });
    try {
      const stored = await getFile(ref.id);
      if (!stored || stored.ext !== ref.ext) {
        setCors(res);
        return sendJson(res, 404, { error: "File not found" });
      }
      publicHeaders(res, ref.ext, `${ref.id}.${ref.ext}`);
      res.statusCode = 200;
      return res.end(stored.content);
    } catch (error) {
      return unavailable(res);
    }
  }

  if (req.method === "POST" || req.method === "PUT" || req.method === "DELETE") {
    const access = hasWriteAccess(req);
    if (!access.ok) return sendJson(res, access.status, { error: access.error });
  } else {
    res.setHeader("Allow", "GET, POST, PUT, DELETE, OPTIONS");
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  try {
    if (req.method === "POST") {
      const body = await readJson(req);
      const ext = String(body.ext || body.format || "").replace(/^\./, "").toLowerCase();
      if (!TYPES[ext]) return sendJson(res, 400, { error: "Format must be txt, json, or md" });
      const contentError = validateContent(body.content, ext);
      if (contentError) return sendJson(res, 400, { error: contentError });

      const id = crypto.randomBytes(8).toString("hex");
      const now = new Date().toISOString();
      await createFile({ id, ext, content: body.content, createdAt: now, updatedAt: now });
      return sendJson(res, 201, { id, ext, url: urlFor(req, { id, ext }), createdAt: now, updatedAt: now });
    }

    if (!ref) return sendJson(res, 400, { error: "Use /files/{id}.{txt|json|md}" });
    const existing = await getFile(ref.id);
    if (!existing || existing.ext !== ref.ext) return sendJson(res, 404, { error: "File not found" });

    if (req.method === "DELETE") {
      await deleteFile(ref.id, ref.ext);
      return sendJson(res, 200, { ok: true, id: ref.id });
    }

    const body = await readJson(req);
    const contentError = validateContent(body.content, ref.ext);
    if (contentError) return sendJson(res, 400, { error: contentError });
    const updatedAt = new Date().toISOString();
    await updateFile(ref.id, ref.ext, body.content, updatedAt);
    return sendJson(res, 200, {
      id: ref.id,
      ext: ref.ext,
      url: urlFor(req, ref),
      createdAt: existing.createdAt,
      updatedAt,
    });
  } catch (error) {
    if (error instanceof SyntaxError) return sendJson(res, 400, { error: "Invalid JSON" });
    return unavailable(res);
  }
};
