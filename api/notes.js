const { notesBinId } = require("./_lib/config");
const { readBin, writeBin } = require("./_lib/jsonbin");
const { sendJson, readJson, hasWriteAccess } = require("./_lib/http");

function fail(res, error) {
  const status = error.status === 404 ? 404 : 502;
  sendJson(res, status, { error: status === 404 ? "Notes bin not found" : "Notes storage is unavailable" });
}

module.exports = async function handler(req, res) {
  const binId = notesBinId();
  if (!binId) return sendJson(res, 503, { error: "Notes storage is not configured" });

  if (req.method === "GET") {
    try {
      const record = await readBin(binId, { version: 1, notes: [] });
      const notes = Array.isArray(record) ? record : (record && Array.isArray(record.notes) ? record.notes : []);
      return sendJson(res, 200, { version: 1, notes });
    } catch (error) {
      return fail(res, error);
    }
  }

  if (req.method === "PUT") {
    const access = hasWriteAccess(req);
    if (!access.ok) return sendJson(res, access.status, { error: access.error });
    try {
      const body = await readJson(req);
      const notes = Array.isArray(body) ? body : body && body.notes;
      if (!Array.isArray(notes)) return sendJson(res, 400, { error: "Expected a notes array" });
      if (notes.length > 10000) return sendJson(res, 413, { error: "Too many notes" });
      await writeBin(binId, { version: 1, notes });
      return sendJson(res, 200, { ok: true });
    } catch (error) {
      if (error instanceof SyntaxError) return sendJson(res, 400, { error: "Invalid JSON" });
      return fail(res, error);
    }
  }

  res.setHeader("Allow", "GET, PUT");
  return sendJson(res, 405, { error: "Method not allowed" });
};
