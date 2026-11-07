function env(name, fallback = "") {
  const value = process.env[name];
  return value == null || value === "" ? fallback : value;
}

function tursoDatabaseUrl() {
  return env("TURSO_DATABASE_URL");
}

function tursoAuthToken() {
  return env("TURSO_AUTH_TOKEN");
}

function writeToken() {
  return env("APP_WRITE_TOKEN");
}

function publicConfig() {
  const enabled = Boolean(tursoDatabaseUrl());
  const canWrite = enabled && Boolean(writeToken());
  return {
    CLOUD_ENABLED: enabled,
    CLOUD_WRITABLE: canWrite,
    FILES_ENABLED: enabled,
    FILES_WRITABLE: canWrite,
  };
}

module.exports = {
  env,
  tursoDatabaseUrl,
  tursoAuthToken,
  writeToken,
  publicConfig,
};
