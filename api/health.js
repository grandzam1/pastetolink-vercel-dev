const { publicConfig } = require("./_lib/config");
const { sendJson } = require("./_lib/http");

module.exports = function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).end("Method not allowed");
    return;
  }
  const config = publicConfig();
  sendJson(res, 200, {
    ok: true,
    notes: config.CLOUD_ENABLED,
    notesWritable: config.CLOUD_WRITABLE,
    files: config.FILES_ENABLED,
    filesWritable: config.FILES_WRITABLE,
  });
};
