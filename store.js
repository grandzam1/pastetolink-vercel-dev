/*
  Store: all note CRUD lives here.

  Layers, from lowest to highest:
    1. notes.json in the project (fallback)
    2. the cloud bin (JSONBin), when configured: the shared copy
    3. a local cache of the last cloud copy (for offline)
    4. this browser's pending changes, which win when newer

  Saves go to the browser first, then sync() pushes them to the cloud.
  If the cloud is unreachable, changes stay pending and push on the next sync.
*/
(function (root) {
  const KEY = "paste-to-link.notes.v1";
  const NO_CLOUD = { enabled: () => false, canWrite: () => false };
  const cloud = () => root.Cloud || NO_CLOUD;

  let base = {};                          // notes.json
  let remote = {};                        // cloud copy (or cache / notes.json)
  let cache = {};                         // last cloud copy, kept for offline
  let local = { notes: {}, deleted: {} }; // pending changes
  let cloudOk = false;
  let lastError = false;
  let busy = false;
  let chain = Promise.resolve();

  function valid(n) {
    return n && typeof n === "object" && /^[a-z0-9]{4,12}$/.test(n.id || "");
  }

  function normalize(n) {
    const now = Date.now();
    return {
      id: n.id,
      title: String(n.title || "").slice(0, 200),
      html: Sanitize.clean(n.html || ""),
      created: Number(n.created) || now,
      updated: Number(n.updated) || now,
    };
  }

  function toMap(list) {
    const m = {};
    (list || []).filter(valid).forEach((n) => { m[n.id] = normalize(n); });
    return m;
  }

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        notes: local.notes, deleted: local.deleted, cache,
      }));
      return true;
    } catch (e) {
      return false;
    }
  }

  function loadLocal() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || "null");
      if (raw) {
        local = { notes: raw.notes || {}, deleted: raw.deleted || {} };
        cache = raw.cache || {};
      }
    } catch (e) { /* keep empty */ }
  }

  async function loadBase() {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 4000);
      const res = await fetch("notes.json", { cache: "no-cache", signal: ctl.signal });
      clearTimeout(timer);
      if (!res.ok) return;
      const data = await res.json();
      base = toMap(Array.isArray(data) ? data : data.notes);
    } catch (e) { /* no project file (or opened from disk): fine */ }
  }

  const pendingCount = () =>
    Object.keys(local.notes).length + Object.keys(local.deleted).length;

  async function init() {
    loadLocal();
    await loadBase();
    remote = Object.assign({}, base, cache);
    if (cloud().enabled()) {
      try {
        remote = toMap(await cloud().read());
        cache = remote;
        cloudOk = true;
        persist();
      } catch (e) {
        lastError = true;
      }
    }
  }

  function get(id) {
    const p = remote[id];
    const l = local.notes[id];
    if (l && (!p || (l.updated || 0) >= (p.updated || 0))) return l;
    if (local.deleted[id]) return null;
    return p || null;
  }

  function all() {
    const ids = new Set([...Object.keys(remote), ...Object.keys(local.notes)]);
    const out = [];
    ids.forEach((id) => {
      const n = get(id);
      if (n) out.push(n);
    });
    return out.sort((a, b) => b.updated - a.updated);
  }

  function newId() {
    let id;
    do {
      id = Math.random().toString(36).slice(2, 8);
    } while (id.length < 6 || !/^[a-z0-9]+$/.test(id) || remote[id] || local.notes[id]);
    return id;
  }

  function save(note) {
    const n = normalize(note);
    local.notes[n.id] = n;
    delete local.deleted[n.id];
    return persist();
  }

  function remove(id) {
    const prev = get(id);
    delete local.notes[id];
    if (remote[id]) local.deleted[id] = Date.now();
    persist();
    return prev;
  }

  function exportJSON() {
    return JSON.stringify({ version: 1, notes: all() }, null, 2);
  }

  function importNotes(list) {
    let count = 0;
    (list || []).filter(valid).forEach((raw) => {
      const n = normalize(raw);
      const cur = get(n.id);
      if (!cur || n.updated > cur.updated) {
        local.notes[n.id] = n;
        delete local.deleted[n.id];
        count++;
      }
    });
    persist();
    return count;
  }

  /* ---------- cloud sync ---------- */

  async function doSync() {
    if (!cloud().enabled()) return { ok: false, reason: "off" };
    busy = true;
    try {
      // always read first so we merge into the latest cloud copy
      const map = toMap(await cloud().read());
      cloudOk = true;
      lastError = false;

      if (!pendingCount() || !cloud().canWrite()) {
        remote = map;
        cache = map;
        persist();
        return { ok: true, pushed: false };
      }

      // first push into an empty bin also carries the project's notes.json
      if (!Object.keys(map).length) Object.assign(map, base);
      Object.values(local.notes).forEach((n) => {
        const r = map[n.id];
        if (!r || (n.updated || 0) >= (r.updated || 0)) map[n.id] = n;
      });
      Object.keys(local.deleted).forEach((id) => { delete map[id]; });

      await cloud().write(Object.values(map));
      remote = map;
      cache = map;
      local = { notes: {}, deleted: {} };
      persist();
      return { ok: true, pushed: true };
    } catch (e) {
      lastError = true;
      cloudOk = false;
      return { ok: false, reason: "error" };
    } finally {
      busy = false;
    }
  }

  // syncs run one at a time so quick saves can't overwrite each other
  function sync() {
    chain = chain.then(doSync, doSync);
    return chain;
  }

  // off | saving | pending | offline | synced | readonly
  function status() {
    if (!cloud().enabled()) return "off";
    if (busy) return "saving";
    if (!cloud().canWrite()) return "readonly";
    if (pendingCount()) return lastError ? "offline" : "pending";
    return cloudOk ? "synced" : "offline";
  }

  root.Store = {
    init, get, all, save, remove, newId, exportJSON, importNotes,
    sync, status, hasPending: () => pendingCount() > 0,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
