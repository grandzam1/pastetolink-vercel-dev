const {
  jsonbinBaseUrl,
  jsonbinKeyHeader,
  jsonbinApiKey,
} = require("./config");

async function request(binId, method, body) {
  const base = jsonbinBaseUrl();
  if (!base) throw new Error("JSONBIN_API_BASE_URL is not configured");
  if (!binId) throw new Error("The JSONBin bin ID is not configured");

  const headers = { "Content-Type": "application/json" };
  const key = jsonbinApiKey();
  if (key) headers[jsonbinKeyHeader()] = key;

  const url = base + "/" + encodeURIComponent(binId) + (method === "GET" ? "/latest" : "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: method === "GET" ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch (e) { /* handled below */ }
  if (!response.ok) {
    const error = new Error("JSONBin returned HTTP " + response.status);
    error.status = response.status;
    throw error;
  }
  return payload && Object.prototype.hasOwnProperty.call(payload, "record")
    ? payload.record
    : payload;
}

async function readBin(binId, emptyValue) {
  try {
    const record = await request(binId, "GET");
    return record == null ? emptyValue : record;
  } catch (error) {
    if (error.status === 404) return emptyValue;
    throw error;
  }
}

async function writeBin(binId, record) {
  return request(binId, "PUT", record);
}

module.exports = { readBin, writeBin };
