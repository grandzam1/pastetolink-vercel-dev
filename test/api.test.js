const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pastetolink-sqlite-test-"));
process.env.TURSO_DATABASE_URL = "file:" + path.join(tempDir, "test.db");
process.env.TURSO_AUTH_TOKEN = "";
process.env.APP_WRITE_TOKEN = "test-app-write-token";
process.env.MAX_FILE_BYTES = "262144";

const fileHandler = require("../api/files");
const notesHandler = require("../api/notes");
const runtimeConfigHandler = require("../api/config");
const healthHandler = require("../api/health");
const database = require("../api/_lib/database");

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

test("file API creates a URL, serves raw content, updates, and deletes from SQLite", async () => {
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

test("JSON files validate JSON and use the JSON MIME type", async () => {
  const invalid = await call(fileHandler, request("POST", { body: { ext: "json", content: "{bad" } }));
  assert.equal(invalid.statusCode, 400);
  assert.match(jsonBody(invalid).error, /valid JSON/);

  const created = await call(fileHandler, request("POST", { body: { ext: "json", content: "{\"ok\":true}" } }));
  const file = jsonBody(created);
  const fetched = await call(fileHandler, request("GET", { file: `${file.id}.json`, authorization: "" }));
  assert.equal(fetched.headers["content-type"], "application/json; charset=utf-8");
  assert.equal(JSON.parse(fetched.body).ok, true);
});

test("Markdown files use text/markdown", async () => {
  const created = await call(fileHandler, request("POST", { body: { ext: "md", content: "# Heading" } }));
  const file = jsonBody(created);
  const fetched = await call(fileHandler, request("GET", { file: `${file.id}.md`, authorization: "" }));
  assert.equal(fetched.headers["content-type"], "text/markdown; charset=utf-8");
  assert.equal(fetched.body, "# Heading");
});

test("note export creates txt, md and json under one permanent ID and re-export updates it", async () => {
  const contents = { txt: "hello", md: "# hello", json: "{\"ok\":true}" };
  const created = await call(fileHandler, request("POST", { body: { noteId: "testnote1", contents } }));
  assert.equal(created.statusCode, 200);
  const { id, urls } = jsonBody(created);
  assert.match(id, /^[a-f0-9]{16}$/);
  assert.ok(urls.txt.endsWith(id + ".txt") && urls.md.endsWith(id + ".md") && urls.json.endsWith(id + ".json"));

  for (const ext of ["txt", "md", "json"]) {
    const fetched = await call(fileHandler, request("GET", { file: `${id}.${ext}`, authorization: "" }));
    assert.equal(fetched.statusCode, 200);
    assert.equal(fetched.body, contents[ext]);
  }

  const again = await call(fileHandler, request("POST", { body: { noteId: "testnote1", contents: { ...contents, txt: "v2" } } }));
  assert.equal(jsonBody(again).id, id);
  const updated = await call(fileHandler, request("GET", { file: `${id}.txt`, authorization: "" }));
  assert.equal(updated.body, "v2");

  await call(fileHandler, request("DELETE", { file: `${id}.txt` }));
  const gone = await call(fileHandler, request("GET", { file: `${id}.md`, authorization: "" }));
  assert.equal(gone.statusCode, 404);
});

test("write operations require the app token while public file GET does not", async () => {
  const denied = await call(fileHandler, request("POST", {
    body: { ext: "md", content: "# test" },
    authorization: "Bearer wrong",
  }));
  assert.equal(denied.statusCode, 401);
  assert.equal(jsonBody(denied).error, "A valid Bearer token is required");
});

test("notes API writes and reads notes from SQLite and protects writes", async () => {
  const note = { id: "abc123", title: "Test note", html: "<p>Saved in SQLite</p>", created: 1, updated: 2 };
  const written = await call(notesHandler, request("PUT", { body: { version: 1, notes: [note] } }));
  assert.equal(written.statusCode, 200);

  const read = await call(notesHandler, request("GET", { authorization: "" }));
  assert.equal(read.statusCode, 200);
  assert.deepEqual(jsonBody(read).notes, [note]);

  const denied = await call(notesHandler, request("PUT", { body: { version: 1, notes: [] }, authorization: "" }));
  assert.equal(denied.statusCode, 401);

  const invalid = await call(notesHandler, request("PUT", { body: { notes: [{ id: "x" }] } }));
  assert.equal(invalid.statusCode, 400);
});

test("runtime config exposes capability flags but no database URL, token, or local path", async () => {
  const res = await call(runtimeConfigHandler, request("GET", { authorization: "" }));
  assert.equal(res.statusCode, 200);
  assert.match(res.headers["content-type"], /javascript/);
  assert.match(res.body, /FILES_WRITABLE/);
  assert.doesNotMatch(res.body, /test-app-write-token|pastetolink-sqlite-test|TURSO_AUTH_TOKEN/);
});

test("health endpoint confirms SQLite connectivity", async () => {
  const res = await call(healthHandler, request("GET", { authorization: "" }));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(jsonBody(res), {
    ok: true,
    database: "connected",
    notesWritable: true,
    filesWritable: true,
  });
});

test.after(async () => {
  await database.close();
  try {
    fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  } catch (error) {
    if (error.code !== "EPERM") throw error;
  }
});
