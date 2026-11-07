const test = require("node:test");
const assert = require("node:assert/strict");

process.env.JSONBIN_API_BASE_URL = "https://jsonbin.test/v3/b";
process.env.JSONBIN_NOTES_BIN_ID = "notes-test-bin";
process.env.JSONBIN_FILES_BIN_ID = "files-test-bin";
process.env.JSONBIN_API_KEY = "test-jsonbin-secret";
process.env.JSONBIN_KEY_HEADER = "X-Access-Key";
process.env.APP_WRITE_TOKEN = "test-app-write-token";
process.env.MAX_FILE_BYTES = "262144";

const fileHandler = require("../api/files");
const notesHandler = require("../api/notes");
const runtimeConfigHandler = require("../api/config");
const bins = {
  "notes-test-bin": { version: 1, notes: [] },
  "files-test-bin": { version: 1, files: {} },
};
const sentHeaders = [];

global.fetch = async (url, options = {}) => {
  const match = String(url).match(/\/v3\/b\/([^/]+)(\/latest)?$/);
  assert.ok(match, "JSONBin URL should use the configured base");
  const binId = decodeURIComponent(match[1]);
  sentHeaders.push(options.headers || {});
  if (options.method === "PUT") bins[binId] = JSON.parse(options.body);
  const record = bins[binId];
  return new Response(JSON.stringify({ record }), {
    status: record ? 200 : 404,
    headers: { "Content-Type": "application/json" },
  });
};

function mockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(value = "") { this.body = String(value); },
  };
}

function request(method, { file, body, authorization = "Bearer test-app-write-token" } = {}) {
  return {
    method,
    query: file ? { file } : {},
    headers: {
      host: "localhost:3000",
      "x-forwarded-proto": "http",
      authorization,
    },
    body,
  };
}

async function call(handler, req) {
  const res = mockResponse();
  await handler(req, res);
  return res;
}

function jsonBody(res) { return JSON.parse(res.body); }

 test("file API creates a URL, returns raw content with the right MIME type, then updates and deletes it", async () => {
  const created = await call(fileHandler, request("POST", { body: { ext: "txt", content: "hello\nworld" } }));
  assert.equal(created.statusCode, 201);
  const file = jsonBody(created);
  assert.match(file.id, /^[a-f0-9]{16}$/);
  assert.equal(file.ext, "txt");
  assert.equal(file.url, `http://localhost:3000/files/${file.id}.txt`);

  const fetched = await call(fileHandler, request("GET", { file: `${file.id}.txt`, authorization: "" }));
  assert.equal(fetched.statusCode, 200);
  assert.equal(fetched.body, "hello\nworld");
  assert.equal(fetched.headers["content-type"], "text/plain; charset=utf-8");
  assert.equal(fetched.headers["access-control-allow-origin"], "*");

  const updated = await call(fileHandler, request("PUT", { file: `${file.id}.txt`, body: { content: "updated" } }));
  assert.equal(updated.statusCode, 200);
  const refetched = await call(fileHandler, request("GET", { file: `${file.id}.txt`, authorization: "" }));
  assert.equal(refetched.body, "updated");

  const deleted = await call(fileHandler, request("DELETE", { file: `${file.id}.txt` }));
  assert.equal(deleted.statusCode, 200);
  const missing = await call(fileHandler, request("GET", { file: `${file.id}.txt`, authorization: "" }));
  assert.equal(missing.statusCode, 404);
});

test("JSON files are validated and served as application/json", async () => {
  const invalid = await call(fileHandler, request("POST", { body: { ext: "json", content: "{bad" } }));
  assert.equal(invalid.statusCode, 400);
  assert.match(jsonBody(invalid).error, /valid JSON/);

  const created = await call(fileHandler, request("POST", { body: { ext: "json", content: "{\"ok\":true}" } }));
  const file = jsonBody(created);
  const fetched = await call(fileHandler, request("GET", { file: `${file.id}.json`, authorization: "" }));
  assert.equal(fetched.headers["content-type"], "application/json; charset=utf-8");
  assert.equal(JSON.parse(fetched.body).ok, true);
});

test("Markdown files are served as text/markdown", async () => {
  const created = await call(fileHandler, request("POST", { body: { ext: "md", content: "# Heading" } }));
  const file = jsonBody(created);
  const fetched = await call(fileHandler, request("GET", { file: `${file.id}.md`, authorization: "" }));
  assert.equal(fetched.headers["content-type"], "text/markdown; charset=utf-8");
  assert.equal(fetched.body, "# Heading");
});

test("write operations require the app token; public GET does not", async () => {
  const denied = await call(fileHandler, request("POST", {
    body: { ext: "md", content: "# test" },
    authorization: "Bearer wrong",
  }));
  assert.equal(denied.statusCode, 401);
  assert.equal(jsonBody(denied).error, "A valid Bearer token is required");
  assert.ok(sentHeaders.some((headers) => headers["X-Access-Key"] === "test-jsonbin-secret"));
});

test("notes API keeps note reads public but protects writes", async () => {
  const read = await call(notesHandler, request("GET", { authorization: "" }));
  assert.equal(read.statusCode, 200);
  assert.deepEqual(jsonBody(read).notes, []);

  const denied = await call(notesHandler, request("PUT", {
    body: { version: 1, notes: [] },
    authorization: "",
  }));
  assert.equal(denied.statusCode, 401);
});

test("browser runtime config contains flags only, not storage credentials or bin IDs", async () => {
  const res = await call(runtimeConfigHandler, request("GET", { authorization: "" }));
  assert.equal(res.statusCode, 200);
  assert.match(res.headers["content-type"], /javascript/);
  assert.match(res.body, /FILES_WRITABLE/);
  assert.doesNotMatch(res.body, /test-jsonbin-secret|notes-test-bin|files-test-bin|test-app-write-token/);
});
