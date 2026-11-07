const crypto = require("node:crypto");
const { writeToken } = require("./config");

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function sendJson(res, status, value) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(value));
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(raw || "{}");
}

function hasWriteAccess(req) {
  const expected = writeToken();
  if (!expected) return { ok: false, status: 503, error: "Writes are not configured" };
  const header = String(req.headers.authorization || "");
  const supplied = header.match(/^Bearer\s+(.+)$/i)?.[1] || "";
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  const valid = a.length === b.length && crypto.timingSafeEqual(a, b);
  return valid
    ? { ok: true }
    : { ok: false, status: 401, error: "A valid Bearer token is required" };
}

function preflight(req, res) {
  setCors(res);
  if (req.method !== "OPTIONS") return false;
  res.statusCode = 204;
  res.end();
  return true;
}

module.exports = { setCors, sendJson, readJson, hasWriteAccess, preflight };
