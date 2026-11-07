function env(name, fallback = "") {
  const value = process.env[name];
  return value == null || value === "" ? fallback : value;
}

function jsonbinBaseUrl() {
  return env("JSONBIN_API_BASE_URL");
}

function jsonbinKeyHeader() {
  return env("JSONBIN_KEY_HEADER", "X-Access-Key");
}

function jsonbinApiKey() {
  return env("JSONBIN_API_KEY");
}

function notesBinId() {
  return env("JSONBIN_NOTES_BIN_ID");
}

function filesBinId() {
  return env("JSONBIN_FILES_BIN_ID");
}

function writeToken() {
  return env("APP_WRITE_TOKEN");
}

function storageReady() {
  return Boolean(jsonbinBaseUrl() && jsonbinApiKey());
}

function publicConfig() {
  const notes = storageReady() && Boolean(notesBinId());
  const files = storageReady() && Boolean(filesBinId());
  const canWrite = Boolean(writeToken());
  return {
    CLOUD_ENABLED: notes,
    CLOUD_WRITABLE: notes && canWrite,
    FILES_ENABLED: files,
    FILES_WRITABLE: files && canWrite,
  };
}

module.exports = {
  env,
  jsonbinBaseUrl,
  jsonbinKeyHeader,
  jsonbinApiKey,
  notesBinId,
  filesBinId,
  writeToken,
  publicConfig,
};
