/*
  Public page: shows one note, read-only. No editor, no controls, no login.

  #k3x9ab    short link: looks the note up in notes.json (the project file)
  #z...      portable link: the note is inside the link itself
*/
(function () {
  const KEY = "paste-to-link.notes.v1"; // lets the author preview before exporting
  const $ = (id) => document.getElementById(id);

  function missing() {
    $("content").classList.add("hidden");
    $("missing").classList.remove("hidden");
    document.title = "Not available";
  }

  function render(title, html) {
    $("title").textContent = title || "";
    $("title").classList.toggle("hidden", !title);
    $("body").innerHTML = Sanitize.clean(html);
    $("missing").classList.add("hidden");
    $("content").classList.remove("hidden");
    document.title = title || "Shared note";
    window.scrollTo(0, 0);
  }

  async function fetchList(url, noStore) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 5000);
      const res = await fetch(url, { cache: noStore ? "no-store" : "no-cache", signal: ctl.signal });
      clearTimeout(timer);
      if (!res.ok) return null;
      const data = await res.json();
      const rec = data && data.record !== undefined ? data.record : data;
      return Array.isArray(rec) ? rec : (rec && rec.notes) || [];
    } catch (e) {
      return null;
    }
  }

  // Same-origin API first, then the project's static notes.json fallback
  async function projectNote(id) {
    const cloud = await fetchList("/api/notes", true);
    const cloudHit = cloud && cloud.find((n) => n && n.id === id);
    if (cloudHit) return cloudHit;
    const list = await fetchList("notes.json");
    return (list && list.find((n) => n && n.id === id)) || null;
  }

  // Only the author's own browser has these; lets them preview unsynced notes
  function localNote(id) {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || "null");
      return (raw && ((raw.notes && raw.notes[id]) || (raw.cache && raw.cache[id]))) || null;
    } catch (e) {
      return null;
    }
  }

  async function load() {
    const h = location.hash.slice(1);
    if (!h) return missing();

    if (/^[a-z0-9]{4,12}$/.test(h)) {
      const p = await projectNote(h);
      const l = localNote(h);
      const n = l && (!p || (l.updated || 0) >= (p.updated || 0)) ? l : p;
      if (n) return render(n.title, n.html);
    }

    try {
      const raw = await Codec.decode(h);
      if (raw.charAt(0) === "\u0001") {
        const o = JSON.parse(raw.slice(1));
        render(String(o.t || ""), String(o.h || ""));
      } else {
        render("", Sanitize.textToHtml(raw)); // old plain-text links
      }
    } catch (e) {
      missing();
    }
  }

  window.addEventListener("hashchange", load);
  load();
})();
