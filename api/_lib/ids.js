const crypto = require("node:crypto");

// One permanent public-file ID per note, shared by .txt, .md and .json.
function noteFileId(noteId) {
  return crypto.createHash("sha256")
    .update("pastetolink-note:" + String(noteId))
    .digest("hex")
    .slice(0, 16);
}

module.exports = { noteFileId };
