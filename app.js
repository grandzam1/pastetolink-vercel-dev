(function () {
  const WARN_LEN = 2000;   // portable link length that gets a warning
  const MAX_LEN = 30000;   // portable link length we refuse to create

  const $ = (id) => document.getElementById(id);
  const SCREENS = ["list", "view", "edit", "shared", "message"];

  function show(name, title) {
    SCREENS.forEach((s) => $(s).classList.toggle("hidden", s !== name));
    document.title = title ? title + " · Paste to Link" : "Paste to Link";
    window.scrollTo(0, 0);
  }

  function baseUrl() {
    return location.origin === "null"
      ? location.href.split("#")[0]
      : location.origin + location.pathname;
  }
  // Public, read-only page (view.html sits next to index.html)
  const publicBase = () => baseUrl().replace(/[^/]*$/, "") + "view.html";
  const shortLink = (id) => publicBase() + "#" + id;

  function fmt(ts) {
    return new Date(ts).toLocaleDateString(undefined, {
      year: "numeric", month: "short", day: "numeric",
    });
  }

  /* ---------- helpers: toast, copy, download ---------- */
  let toastTimer = null;
  function toast(msg, actionLabel, action) {
    $("toastMsg").textContent = msg;
    const act = $("toastAct");
    act.classList.toggle("hidden", !actionLabel);
    act.textContent = actionLabel || "";
    act.onclick = () => { $("toast").classList.add("hidden"); if (action) action(); };
    $("toast").classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $("toast").classList.add("hidden"), actionLabel ? 7000 : 3500);
  }

  async function copy(text, okMsg) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const t = document.createElement("textarea");
      t.value = text;
      document.body.appendChild(t);
      t.select();
      document.execCommand("copy");
      t.remove();
    }
    toast(okMsg || "Copied");
  }

  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type: type || "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function fileName(title) {
    return (title || "note").replace(/[^\w\- ]+/g, "").trim().slice(0, 40).replace(/\s+/g, "-") || "note";
  }

  function message(badge, text) {
    $("msgBadge").textContent = badge;
    $("msgText").textContent = text;
    show("message", badge);
  }

  /* ---------- cloud sync status ---------- */
  const BADGES = {
    saving:   ["Saving to cloud...", "cr-badge--info"],
    synced:   ["Synced to cloud", "cr-badge--ok"],
    pending:  ["Not synced yet", "cr-badge--warn"],
    offline:  ["Cloud unreachable, saved on this device", "cr-badge--warn"],
    readonly: ["Cloud read-only (enter write token)", "cr-badge--muted"],
  };

  function updateBadge() {
    const s = Store.status();
    const b = $("syncBadge");
    b.classList.toggle("hidden", s === "off");
    $("syncBtn").classList.toggle("hidden", s === "off");
    if (s === "off") return;
    b.textContent = BADGES[s][0];
    b.className = "cr-badge " + BADGES[s][1];
  }

  // Push pending changes to the cloud without blocking the screen.
  async function pushChanges(quiet) {
    if (Store.status() === "off") return;
    const p = Store.sync();
    updateBadge();
    const r = await p;
    updateBadge();
    if (!r.ok && r.reason === "error" && !quiet) {
      toast("Saved on this device. Cloud sync failed and will retry on your next save.");
    }
    if (r.ok && !$("list").classList.contains("hidden")) fillList();
  }

  $("syncBtn").addEventListener("click", async () => {
    await pushChanges(true);
    const s = Store.status();
    toast(s === "synced" ? "Up to date" : BADGES[s] ? BADGES[s][0] : "Done");
  });

  const writeTokenInput = $("writeToken");
  writeTokenInput.value = Cloud.getWriteToken();
  writeTokenInput.addEventListener("input", () => {
    Cloud.setWriteToken(writeTokenInput.value);
    updateBadge();
  });

  /* ---------- LIST ---------- */
  function fillList() {
    const q = $("search").value.trim().toLowerCase();
    const box = $("noteList");
    box.innerHTML = "";
    const all = Store.all();
    const rows = all
      .map((n) => ({ n, text: Sanitize.toText(n.html) }))
      .filter((r) => !q || (r.n.title + " " + r.text).toLowerCase().includes(q));

    if (!rows.length) {
      const c = document.createElement("div");
      c.className = "cr-card empty";
      c.textContent = all.length
        ? "No notes match your search."
        : "No notes yet. Click New note to write or paste something.";
      box.appendChild(c);
      return;
    }

    rows.forEach(({ n, text }) => {
      const a = document.createElement("a");
      a.className = "note-card";
      a.href = "#/" + n.id;
      const h = document.createElement("h3");
      h.className = "note-card-title";
      h.textContent = n.title || "Untitled";
      const p = document.createElement("p");
      p.className = "note-card-snippet";
      p.textContent = text.replace(/\s+/g, " ").slice(0, 140) || "(empty)";
      const m = document.createElement("span");
      m.className = "note";
      m.textContent = fmt(n.updated);
      a.append(h, p, m);
      box.appendChild(a);
    });
  }

  function renderList() {
    fillList();
    updateBadge();
    show("list");
  }
  $("search").addEventListener("input", fillList);

  $("exportBtn").addEventListener("click", () => {
    download("notes.json", Store.exportJSON(), "application/json");
    toast("Exported notes.json. Add it to the project to share short links.");
  });
  $("importBtn").addEventListener("click", () => $("importFile").click());
  $("importFile").addEventListener("change", async (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const n = Store.importNotes(Array.isArray(data) ? data : data.notes);
      fillList();
      toast(n ? "Imported " + n + (n === 1 ? " note" : " notes") : "Nothing new to import");
      if (n) pushChanges(true);
    } catch (err) {
      toast("That file isn't a valid notes.json.");
    }
  });

  /* ---------- VIEW ---------- */
  let current = null;
  let deleteArmed = false;
  let deleteTimer = null;

  function resetDeleteBtn() {
    deleteArmed = false;
    clearTimeout(deleteTimer);
    const b = $("deleteBtn");
    b.textContent = "Delete";
    b.className = "cr-btn cr-btn--secondary";
  }

  function renderView(id) {
    const n = Store.get(id);
    if (!n) {
      return message("Note not found",
        "This note isn't in this browser or in the project's notes.json. If it was shared with you, ask for the portable link or an updated notes.json.");
    }
    current = n;
    $("viewTitle").textContent = n.title || "Untitled";
    $("viewMeta").textContent = "Updated " + fmt(n.updated);
    $("viewBody").innerHTML = Sanitize.clean(n.html);
    resetDeleteBtn();
    show("view", n.title || "Untitled");
  }

  $("editBtn").addEventListener("click", () => { location.hash = "#/" + current.id + "/edit"; });
  $("copyLinkBtn").addEventListener("click", () => copy(shortLink(current.id), "Public link copied"));
  $("previewBtn").addEventListener("click", () => window.open(shortLink(current.id), "_blank", "noopener"));
  $("copyTextBtn").addEventListener("click", () => copy(Sanitize.toText(current.html), "Text copied"));
  $("downloadBtn").addEventListener("click", () =>
    download(fileName(current.title) + ".txt", (current.title ? current.title + "\n\n" : "") + Sanitize.toText(current.html)));

  async function portableLink(n) {
    const data = await Codec.encode("\u0001" + JSON.stringify({ t: n.title, h: Sanitize.clean(n.html) }));
    return publicBase() + "#" + data;
  }

  $("portableBtn").addEventListener("click", async () => {
    try {
      const link = await portableLink(current);
      if (link.length > MAX_LEN) {
        toast("This note is too large for a portable link. Use Export instead.");
        return;
      }
      await copy(link, link.length > WARN_LEN
        ? "Copied. This link is long, some apps may cut it off."
        : "Portable link copied");
    } catch (e) {
      toast("Could not create the link. Please try again.");
    }
  });

  $("deleteBtn").addEventListener("click", () => {
    const b = $("deleteBtn");
    if (!deleteArmed) {
      deleteArmed = true;
      b.textContent = "Click again to delete";
      b.className = "cr-btn cr-btn--danger";
      deleteTimer = setTimeout(resetDeleteBtn, 4000);
      return;
    }
    const gone = Store.remove(current.id);
    resetDeleteBtn();
    location.hash = "#/";
    pushChanges(true);
    toast("Note deleted", "Undo", () => {
      if (gone) {
        Store.save(gone);
        location.hash = "#/" + gone.id;
        pushChanges(true);
      }
    });
  });

  /* ---------- CREATE / EDIT ---------- */
  let editor = null;
  let editId = null;
  let dirty = false;
  let activeFile = null;

  function renderEdit(id) {
    let n = null;
    if (id) {
      n = Store.get(id);
      if (!n) return message("Note not found", "That note doesn't exist, so it can't be edited.");
    }
    editId = id;
    activeFile = null;
    $("editHeading").textContent = id ? "Edit note" : "New note";
    $("titleInput").value = n ? n.title : "";
    $("fileLinkPanel").classList.add("hidden");
    $("deleteFileBtn").classList.add("hidden");
    $("newFileBtn").classList.add("hidden");
    $("fileFormat").disabled = false;
    $("saveFileBtn").textContent = "Save file";
    if (!editor) {
      editor = Editor.create($("editorMount"), {
        onChange: () => { dirty = true; },
        onToast: toast,
      });
    }
    editor.setHTML(n ? n.html : "");
    dirty = false;
    show("edit", id ? "Edit note" : "New note");
    (id ? editor : $("titleInput")).focus();
  }

  $("titleInput").addEventListener("input", () => { dirty = true; });

  function save() {
    const html = editor.getHTML();
    const text = Sanitize.toText(html);
    let title = $("titleInput").value.trim();
    if (!title && !text) { toast("Add a title or some text first."); return; }
    if (!title) title = text.split("\n")[0].slice(0, 60);

    const now = Date.now();
    const prev = editId ? Store.get(editId) : null;
    const note = {
      id: editId || Store.newId(),
      title, html,
      created: prev ? prev.created : now,
      updated: now,
    };
    if (!Store.save(note)) {
      toast("Couldn't save in this browser (storage full or blocked). Copy your text somewhere safe.");
      return;
    }
    dirty = false;
    location.hash = "#/" + note.id;
    toast("Saved");
    pushChanges();
  }

  $("saveBtn").addEventListener("click", save);
  $("cancelBtn").addEventListener("click", () => {
    if (dirty && !window.confirm("Discard your changes?")) return;
    dirty = false;
    location.hash = editId ? "#/" + editId : "#/";
  });

  function markdownFromHtml(html) {
    const body = new DOMParser().parseFromString(Sanitize.clean(html), "text/html").body;
    function inline(node) {
      return Array.from(node.childNodes).map((child) => {
        if (child.nodeType === 3) return child.nodeValue;
        if (child.nodeType !== 1) return "";
        const tag = child.tagName;
        const text = inline(child);
        if (tag === "BR") return "\n";
        if (tag === "STRONG") return "**" + text + "**";
        if (tag === "EM") return "*" + text + "*";
        if (tag === "S") return "~~" + text + "~~";
        if (tag === "CODE") return "`" + text.replace(/`/g, "\\`") + "`";
        if (tag === "A") return "[" + (text || child.href) + "](" + child.href + ")";
        return text;
      }).join("");
    }
    function blocks(parent) {
      return Array.from(parent.childNodes).map((node) => {
        if (node.nodeType === 3) return node.nodeValue;
        if (node.nodeType !== 1) return "";
        const tag = node.tagName;
        if (tag === "P") return inline(node).trim() + "\n\n";
        if (/^H[1-3]$/.test(tag)) return "#".repeat(Number(tag.slice(1))) + " " + inline(node).trim() + "\n\n";
        if (tag === "PRE") return "```\n" + node.textContent.replace(/\n+$/, "") + "\n```\n\n";
        if (tag === "UL" || tag === "OL") {
          const items = Array.from(node.children).filter((item) => item.tagName === "LI");
          return items.map((item, index) => (tag === "OL" ? (index + 1) + ". " : "- ") + inline(item).trim()).join("\n") + "\n\n";
        }
        if (tag === "BLOCKQUOTE") {
          return blocks(node).trim().split("\n").map((line) => "> " + line).join("\n") + "\n\n";
        }
        if (tag === "HR") return "---\n\n";
        if (tag === "BR") return "\n";
        return inline(node);
      }).join("");
    }
    return blocks(body).trim();
  }

  function fileContent(ext) {
    const html = editor.getHTML();
    if (ext === "txt") return Sanitize.toText(html);
    if (ext === "md") return markdownFromHtml(html);
    const parsed = JSON.parse(Sanitize.toText(html));
    return JSON.stringify(parsed, null, 2);
  }

  async function requestFile(path, method, content) {
    const headers = { Authorization: "Bearer " + Cloud.getWriteToken() };
    const options = { method, headers };
    if (content !== undefined) {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(content);
    }
    const res = await fetch(path, options);
    let data = {};
    try { data = await res.json(); } catch (e) { /* show generic error */ }
    if (!res.ok) throw new Error(data.error || "File request failed (" + res.status + ")");
    return data;
  }

  function showFileLink(file) {
    activeFile = file;
    $("fileUrl").value = file.url || new URL("/files/" + file.id + "." + file.ext, location.origin).href;
    $("fileLinkPanel").classList.remove("hidden");
    $("fileFormat").value = file.ext;
    $("fileFormat").disabled = true;
    $("saveFileBtn").textContent = "Update file";
    $("deleteFileBtn").classList.remove("hidden");
    $("newFileBtn").classList.remove("hidden");
  }

  $("saveFileBtn").addEventListener("click", async () => {
    if (!Cloud.getWriteToken()) { toast("Enter the write token on the notes page first."); return; }
    if (!(window.APP_CONFIG || {}).FILES_WRITABLE) { toast("File storage and write access are not configured yet."); return; }
    const ext = $("fileFormat").value;
    const updating = !!activeFile;
    let content;
    try {
      content = fileContent(ext);
    } catch (error) {
      toast(ext === "json" ? "The editor content must be valid JSON." : "Couldn't convert the editor content.");
      return;
    }
    try {
      const result = activeFile
        ? await requestFile("/api/files?file=" + encodeURIComponent(activeFile.id + "." + activeFile.ext), "PUT", { content })
        : await requestFile("/api/files", "POST", { ext, content });
      showFileLink(result);
      toast(updating ? "File updated" : "File saved");
    } catch (error) {
      toast(error.message || "Couldn't save the file.");
    }
  });

  $("deleteFileBtn").addEventListener("click", async () => {
    if (!activeFile || !window.confirm("Delete this public file? This cannot be undone.")) return;
    try {
      await requestFile("/api/files?file=" + encodeURIComponent(activeFile.id + "." + activeFile.ext), "DELETE");
      activeFile = null;
      $("fileLinkPanel").classList.add("hidden");
      $("deleteFileBtn").classList.add("hidden");
      $("newFileBtn").classList.add("hidden");
      $("fileFormat").disabled = false;
      $("saveFileBtn").textContent = "Save file";
      toast("File deleted");
    } catch (error) {
      toast(error.message || "Couldn't delete the file.");
    }
  });

  $("newFileBtn").addEventListener("click", () => {
    if (!window.confirm("The existing file will remain published. Start another file?")) return;
    activeFile = null;
    $("fileLinkPanel").classList.add("hidden");
    $("deleteFileBtn").classList.add("hidden");
    $("newFileBtn").classList.add("hidden");
    $("fileFormat").disabled = false;
    $("saveFileBtn").textContent = "Save file";
  });

  $("copyFileUrlBtn").addEventListener("click", () => copy($("fileUrl").value, "Direct file URL copied"));

  $("loadFileBtn").addEventListener("click", async () => {
    let url;
    try { url = new URL($("loadFileUrl").value.trim(), location.origin); }
    catch (error) { toast("Paste a valid direct file URL."); return; }
    const match = url.pathname.match(/\/files\/([a-f0-9]{16})\.(txt|json|md)$/i);
    if (url.origin !== location.origin || !match) {
      toast("Use a direct /files/{id}.txt, .json, or .md URL from this app.");
      return;
    }
    try {
      const res = await fetch(url.pathname, { cache: "no-store" });
      if (!res.ok) throw new Error("File request failed (" + res.status + ")");
      const content = await res.text();
      const ext = match[2].toLowerCase();
      if (ext === "json") JSON.parse(content);
      editor.setHTML(Sanitize.textToHtml(content));
      dirty = false;
      showFileLink({ id: match[1].toLowerCase(), ext, url: url.href });
      toast("File loaded. Save updates it; Delete removes it.");
    } catch (error) {
      toast(error instanceof SyntaxError ? "The file contains invalid JSON." : (error.message || "Couldn't load the file."));
    }
  });

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && !$("edit").classList.contains("hidden")) {
      e.preventDefault();
      save();
    }
  });

  window.addEventListener("beforeunload", (e) => {
    if (dirty && !$("edit").classList.contains("hidden")) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  /* ---------- SHARED (old and portable links) ---------- */
  let shared = null;

  async function renderShared(data) {
    try {
      const raw = await Codec.decode(data);
      let title = "";
      let html;
      if (raw.charAt(0) === "\u0001") {
        const o = JSON.parse(raw.slice(1));
        title = String(o.t || "");
        html = Sanitize.clean(o.h || "");
      } else {
        html = Sanitize.textToHtml(raw); // old plain-text links
      }
      shared = { title, html };
      $("sharedTitle").textContent = title;
      $("sharedTitle").classList.toggle("hidden", !title);
      $("sharedBody").innerHTML = html;
      show("shared", title || "Shared text");
    } catch (e) {
      message("Invalid link", "This link is invalid or incomplete. It may have been cut off when shared.");
    }
  }

  $("sharedSaveBtn").addEventListener("click", () => {
    const now = Date.now();
    const text = Sanitize.toText(shared.html);
    const note = {
      id: Store.newId(),
      title: shared.title || text.split("\n")[0].slice(0, 60) || "Untitled",
      html: shared.html, created: now, updated: now,
    };
    if (!Store.save(note)) { toast("Couldn't save in this browser."); return; }
    location.hash = "#/" + note.id;
    toast("Saved to your notes");
    pushChanges();
  });
  $("sharedCopyBtn").addEventListener("click", () => copy(Sanitize.toText(shared.html), "Text copied"));
  $("sharedDownloadBtn").addEventListener("click", () =>
    download(fileName(shared.title) + ".txt", (shared.title ? shared.title + "\n\n" : "") + Sanitize.toText(shared.html)));

  /* ---------- ROUTER ---------- */
  //  #/            all notes
  //  #/new         create
  //  #/<id>        read
  //  #/<id>/edit   update
  //  #z... #r...   old self-contained links (still supported)
  function route() {
    const h = location.hash.slice(1);
    if (!h || h === "/") return renderList();
    if (h.charAt(0) === "/") {
      const parts = h.slice(1).split("/");
      if (parts[0] === "new") return renderEdit(null);
      if (!/^[a-z0-9]{4,12}$/.test(parts[0])) {
        return message("Invalid link", "This link isn't valid.");
      }
      return parts[1] === "edit" ? renderEdit(parts[0]) : renderView(parts[0]);
    }
    return renderShared(h);
  }

  window.addEventListener("hashchange", route);
  Store.init().then(() => {
    route();
    updateBadge();
    // push anything saved earlier that never reached the cloud
    if (Store.hasPending()) pushChanges(true);
  });
})();
