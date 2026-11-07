# Paste to Link

A lightweight static dashboard for writing and sharing notes, with Vercel serverless endpoints for note sync and direct public files. The existing HTML/CSS/JavaScript application remains in the repository root. There is no frontend build step.

## Project structure

```text
api/                  Vercel serverless functions
  _lib/config.js      Server-only environment configuration
  _lib/database.js    SQLite/Turso schema and data operations
  _lib/http.js        HTTP and write-token helpers
  config.js           Safe runtime capability flags for the browser
  files.js            File create/update/delete and raw GET handler
  health.js           Database connection check
  notes.js            Same-origin notes API
dev-server.js         Login-free local HTTP runner using the same API handlers
app.js, editor.js     Dashboard and rich-text editor
cloud.js              Same-origin notes API client
.env.example          Local SQLite and production Turso settings
vercel.json           /files/{id}.{ext} route rewrite
```

## Local development

Requires Node.js 20 or newer and npm.

```bash
cp .env.example .env.local
# Keep the default file: URL for local SQLite. Replace APP_WRITE_TOKEN with a long random value.
npm install
npm run dev
```

Open `http://localhost:3000`. The local runner serves the static dashboard and routes API calls to the same Vercel function handlers. The SQLite database is created automatically at `data/pastetolink.db` and is ignored by Git. No Turso account, Vercel login, or cloud database is required for local testing.

### Environment variables

| Variable | Local development | Vercel production |
| --- | --- | --- |
| `TURSO_DATABASE_URL` | `file:./data/pastetolink.db` | Turso URL such as `libsql://your-database-your-org.turso.io` |
| `TURSO_AUTH_TOKEN` | Leave empty for a local SQLite file | Token for the selected Turso database |
| `APP_WRITE_TOKEN` | Long random string you enter in the dashboard’s API settings | Long random secret set in Vercel environment variables |
| `MAX_FILE_BYTES` | Optional; defaults to 262144 | Optional; defaults to 262144 |

The server opens the same libSQL-compatible client in both environments. The browser receives only capability flags. It never receives the Turso URL, Turso token, or app write token from server configuration.

To make a hosted Turso database, create one in Turso and set the URL and generated auth token in Vercel Project Settings → Environment Variables. Never put the remote token in a `VITE_`/public variable or commit it. Use the same variable names locally if you intentionally want to develop against that remote database; that may use your Turso quota. The default local SQLite file is safer for ordinary development.

## Database schema and data

On first request, the API creates two tables: `notes` stores the existing note IDs, title, sanitized HTML, and timestamps; `files` stores each file ID, extension, content, and timestamps. Creating or updating app content writes directly to the database.

The old JSONBin integration is removed. Before moving an existing set of notes, export them from the old app as `notes.json`. In the new app, open the dashboard, use **Import**, and select that JSON file. Once imported, the notes are saved through the same-origin API into SQLite/Turso. Files already saved in JSONBin are not automatically copied; download/export their contents and save them again through the new file controls.

## Direct file endpoints

- `POST /api/files` with `Authorization: Bearer <APP_WRITE_TOKEN>` and JSON body `{"ext":"txt|json|md","content":"..."}` creates a file and returns its ID and URL.
- `GET /files/{id}.txt`, `.json`, or `.md` is public. It returns raw file contents with the matching `Content-Type` and allows cross-origin reads.
- `PUT /api/files?file={id}.{ext}` with the same bearer token updates a file.
- `DELETE /api/files?file={id}.{ext}` with the same bearer token deletes a file.

The dashboard’s **Save file** controls use those endpoints. `.txt` saves plain text, `.md` converts editor formatting to Markdown, and `.json` validates and pretty-prints valid JSON. The direct URL uses the active request host, not a hardcoded localhost or production domain. To update/delete a file after reloading the dashboard, paste its direct URL into **Open an existing file**.

Public GET is unauthenticated so scripts, integrations, and AI agents can fetch the file. Writes require the token to prevent strangers from overwriting or deleting public files. The app keeps the token in session storage for the current tab.

## Tests and deployment

```bash
npm test
npm run dev
```

`npm test` uses temporary SQLite databases and exercises the API over real SQL. For the Vercel CLI runtime, use `npm run dev:vercel` after installing/linking/authenticating the Vercel project. Deployment to Vercel requires setting the Turso URL, Turso auth token, and app write token in Vercel’s environment settings.

GitHub Pages cannot run the API or persist writes. Deploy the repository to Vercel (Git integration works without GitHub Actions) to use the same-origin `/api/...` and `/files/...` URLs in production.

## Security note

Older versions used a browser-side JSONBin key in `config.js`. If that key was ever committed to a public repository, treat it as exposed and rotate/revoke it. This version does not use JSONBin and does not include any credentials in source.
