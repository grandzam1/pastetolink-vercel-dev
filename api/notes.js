const { publicConfig } = require("./_lib/config");
const { listNotes, replaceNotes } = require("./_lib/database");
const { sendJson, readJson, hasWriteAccess } = require("./_lib/http");

function validNotes(value) {
  if (!Array.isArray(value)) return "Expected a notes array";
  if (value.length > 10000) return "Too many notes";
  for (const note of value) {
    if (!note || typeof note !== "object" || !/^[a-z0-9]{4,12}$/.test(String(note.id || ""))) {
      return "Each note must have a valid id";
    }
    if (typeof note.title !== "string" || typeof note.html !== "string") {
      return "Each note must have a string title and html body";
    }
    if (note.title.length > 200 || Buffer.byteLength(note.html, "utf8") > 1048576) {
      return "A note exceeds the allowed size";
    }
    if (!Number.isFinite(Number(note.created)) || !Number.isFinite(Number(note.updated))) {
      return "Each note must have numeric created and updated timestamps";
    }
  }
  return "";
}

function unavailable(res) {
  return sendJson(res, 503, { error: "Database is not configured or unavailable" });
}

module.exports = async function handler(req, res) {
  if (!publicConfig().CLOUD_ENABLED) return unavailable(res);

  if (req.method === "GET") {
    try {
      const notes = await listNotes();
      return sendJson(res, 200, { version: 1, notes });
    } catch (error) {
      return unavailable(res);
    }
  }

  if (req.method === "PUT") {
    const access = hasWriteAccess(req);
    if (!access.ok) return sendJson(res, access.status, { error: access.error });
    try {
      const body = await readJson(req);
      const notes = Array.isArray(body) ? body : body && body.notes;
      const validationError = validNotes(notes);
      if (validationError) return sendJson(res, 400, { error: validationError });
      await replaceNotes(notes.map((note) => ({
        id: String(note.id),
        title: String(note.title),
        html: String(note.html),
        created: Number(note.created),
        updated: Number(note.updated),
      })));
      return sendJson(res, 200, { ok: true });
    } catch (error) {
      if (error instanceof SyntaxError) return sendJson(res, 400, { error: "Invalid JSON" });
      return unavailable(res);
    }
  }

  res.setHeader("Allow", "GET, PUT");
  return sendJson(res, 405, { error: "Method not allowed" });
};
