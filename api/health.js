const { publicConfig } = require("./_lib/config");
const { ping } = require("./_lib/database");
const { sendJson } = require("./_lib/http");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).end("Method not allowed");
    return;
  }
  const config = publicConfig();
  let databaseOk = false;
  if (config.CLOUD_ENABLED) {
    try { databaseOk = await ping(); } catch (error) { databaseOk = false; }
  }
  sendJson(res, databaseOk ? 200 : 503, {
    ok: databaseOk,
    database: databaseOk ? "connected" : (config.CLOUD_ENABLED ? "unavailable" : "not-configured"),
    notesWritable: config.CLOUD_WRITABLE,
    filesWritable: config.FILES_WRITABLE,
  });
};
