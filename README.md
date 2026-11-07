# Paste to Link

A lightweight static dashboard for writing and sharing notes, with Vercel serverless endpoints for cloud sync and public raw files. The existing HTML/CSS/JavaScript UI remains in the repository root; there is no build step.

## Project structure

```text
api/                 Vercel serverless functions
  _lib/              Environment, HTTP and JSONBin helpers
  config.js          Safe runtime capability flags for the browser
  files.js           File create/update/delete and raw file GET handler
  health.js          Readiness status without secrets
  notes.js           Same-origin notes API
app.js, editor.js    Existing dashboard and editor
cloud.js             Same-origin API client (no JSONBin credentials)
public.js            Read-only note page
.env.example         Names and example values for local/Vercel settings
vercel.json          /files/{id}.{ext} route rewrite
```

## Local development

Requires Node.js 20 or newer and npm.

1. Copy `.env.example` to `.env.local`.
2. Fill in the JSONBin values and choose a long random `APP_WRITE_TOKEN`. Use a rotated JSONBin key; do not reuse a key that was ever committed or shared.
3. Run `npm install` once. If the Vercel CLI asks, authenticate with `npx vercel login` and link/create a Vercel project with `npx vercel link`.
4. Run `npm run dev` and open `http://localhost:3000`.

`.env.local` is ignored by Git. Keep the same variable names in Vercel Project Settings → Environment Variables. After linking the project with the Vercel CLI, `vercel env pull .env.local` can populate local values from Vercel.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `JSONBIN_API_BASE_URL` | JSONBin API base, normally `https://api.jsonbin.io/v3/b` |
| `JSONBIN_NOTES_BIN_ID` | Existing notes bin ID |
| `JSONBIN_FILES_BIN_ID` | Dedicated files bin ID; keep files separate from notes to avoid sync overwrites |
| `JSONBIN_API_KEY` | Server-only JSONBin access key with access to both bins |
| `JSONBIN_KEY_HEADER` | `X-Access-Key` (recommended) or `X-Master-Key` |
| `APP_WRITE_TOKEN` | Bearer token required for note and file writes; never embed it in source |
| `MAX_FILE_BYTES` | Maximum file content size; defaults to 262144 bytes |

Create a notes bin containing `{"version":1,"notes":[]}` and a separate files bin containing `{"version":1,"files":{}}`. The API will use those existing JSONBin records; JSONBin remains the data store.

## Direct file endpoints

- `POST /api/files` with `Authorization: Bearer <APP_WRITE_TOKEN>` and JSON body `{"ext":"txt|json|md","content":"..."}` creates a file and returns its ID and URL.
- `GET /files/{id}.txt`, `.json`, or `.md` is public, returns the raw content (not an HTML viewer), sets the matching `Content-Type`, and permits cross-origin GETs.
- `PUT /api/files?file={id}.{ext}` with the same bearer token updates a file.
- `DELETE /api/files?file={id}.{ext}` with the same bearer token deletes a file.

The dashboard’s **Save file** controls use those endpoints. `.txt` saves plain text, `.md` converts the editor formatting to Markdown, and `.json` validates then pretty-prints valid JSON. The direct URL is generated from the active request/environment, not a hardcoded domain. The app keeps the write token in session storage only; it is not committed or sent to JSONBin from the browser. To edit or delete a file after reloading the dashboard, paste its direct URL into **Open an existing file**.

The token is required for writes because otherwise anyone could overwrite or delete public files. Public GET remains unauthenticated for scripts, integrations, and AI agents.

## Notes and existing behavior

The notes dashboard, local browser storage, import/export, rich-text editor, portable links, and read-only `view.html` remain. Notes sync now uses `/api/notes`, which keeps JSONBin credentials on the server. Without cloud environment variables, browser-local notes and static `notes.json` still work; cloud sync and file storage report as unavailable.

## Production hosting limitation

GitHub Pages only serves static files and cannot run this API or accept file writes. Deploy the same repository to Vercel (Git integration can deploy without GitHub Actions) and set the environment variables there. Vercel serves the dashboard and `/files/...` endpoints from the same origin. Local API testing uses `vercel dev` via `npm run dev`.

## Security note for existing checkouts

Older versions used `config.js` for a browser-side JSONBin key. If that file/key was ever committed to a public repository, treat the key as exposed and rotate it at JSONBin. The new setup does not use or commit `config.js`; keep `.env.local` private.
