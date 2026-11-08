const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@libsql/client");
const { tursoDatabaseUrl, tursoAuthToken } = require("./config");

let clientInstance;
let schemaPromise;

function ensureLocalDirectory(url) {
  if (!url.startsWith("file:")) return;
  const filePath = decodeURIComponent(url.slice("file:".length).split("?")[0]);
  const absolutePath = path.resolve(filePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
}

function getClient() {
  const url = tursoDatabaseUrl();
  if (!url) throw new Error("TURSO_DATABASE_URL is not configured");
  if (!clientInstance) {
    ensureLocalDirectory(url);
    const options = { url };
    const authToken = tursoAuthToken();
    if (authToken && !url.startsWith("file:")) options.authToken = authToken;
    clientInstance = createClient(options);
  }
  return clientInstance;
}

async function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const db = getClient();
      await db.execute(`CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        html TEXT NOT NULL,
        created INTEGER NOT NULL,
        updated INTEGER NOT NULL
      )`);
      const filesInfo = await db.execute("PRAGMA table_info(files)");
      const filesExists = filesInfo.rows.length > 0;
      const extInPk = filesInfo.rows.some((row) => String(row.name) === "ext" && Number(row.pk) > 0);
      const createFilesTable = `CREATE TABLE files (
        id TEXT NOT NULL,
        ext TEXT NOT NULL CHECK (ext IN ('txt', 'json', 'md')),
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (id, ext)
      )`;
      if (!filesExists) {
        await db.execute(createFilesTable);
      } else if (!extInPk) {
        await db.batch([
          { sql: "ALTER TABLE files RENAME TO files_legacy", args: [] },
          { sql: createFilesTable, args: [] },
          { sql: "INSERT INTO files (id, ext, content, created_at, updated_at) SELECT id, ext, content, created_at, updated_at FROM files_legacy", args: [] },
          { sql: "DROP TABLE files_legacy", args: [] },
        ], "write");
      }
      await db.execute("CREATE INDEX IF NOT EXISTS notes_updated_idx ON notes(updated DESC)");
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  await schemaPromise;
  return getClient();
}

async function ping() {
  const db = await ensureSchema();
  await db.execute("SELECT 1 AS ok");
  return true;
}

async function listNotes() {
  const db = await ensureSchema();
  const result = await db.execute("SELECT id, title, html, created, updated FROM notes ORDER BY updated DESC");
  return result.rows.map((row) => ({
    id: String(row.id),
    title: String(row.title || ""),
    html: String(row.html || ""),
    created: Number(row.created) || 0,
    updated: Number(row.updated) || 0,
  }));
}

async function replaceNotes(notes) {
  const db = await ensureSchema();
  const statements = [{ sql: "DELETE FROM notes" }];
  for (const note of notes) {
    statements.push({
      sql: "INSERT INTO notes (id, title, html, created, updated) VALUES (?, ?, ?, ?, ?)",
      args: [note.id, note.title, note.html, note.created, note.updated],
    });
  }
  await db.batch(statements, "write");
}

async function createFile(file) {
  const db = await ensureSchema();
  await db.execute({
    sql: "INSERT INTO files (id, ext, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    args: [file.id, file.ext, file.content, file.createdAt, file.updatedAt],
  });
}

async function upsertFile(file) {
  const db = await ensureSchema();
  await db.execute({
    sql: `INSERT INTO files (id, ext, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(id, ext) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`,
    args: [file.id, file.ext, file.content, file.createdAt, file.updatedAt],
  });
}

async function getFile(id, ext) {
  const db = await ensureSchema();
  const result = await db.execute({
    sql: "SELECT id, ext, content, created_at, updated_at FROM files WHERE id = ? AND ext = ?",
    args: [id, ext],
  });
  const row = result.rows[0];
  return row ? {
    id: String(row.id),
    ext: String(row.ext),
    content: String(row.content),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  } : null;
}

async function updateFile(id, ext, content, updatedAt) {
  const db = await ensureSchema();
  const result = await db.execute({
    sql: "UPDATE files SET content = ?, updated_at = ? WHERE id = ? AND ext = ?",
    args: [content, updatedAt, id, ext],
  });
  return Number(result.rowsAffected) > 0;
}

async function deleteFile(id, ext) {
  const db = await ensureSchema();
  const result = await db.execute(
    ext
      ? { sql: "DELETE FROM files WHERE id = ? AND ext = ?", args: [id, ext] }
      : { sql: "DELETE FROM files WHERE id = ?", args: [id] }
  );
  return Number(result.rowsAffected) > 0;
}

async function close() {
  if (clientInstance) {
    clientInstance.close();
    clientInstance = undefined;
    schemaPromise = undefined;
  }
}

module.exports = { getClient, ensureSchema, ping, listNotes, replaceNotes, createFile, upsertFile, getFile, updateFile, deleteFile, close };
