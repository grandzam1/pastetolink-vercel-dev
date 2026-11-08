/*
  Cloud: same-origin JSON API. Database credentials never reach the browser;
  the Vercel functions proxy reads and writes using server environment values.
*/
(function (root) {
  const TOKEN_KEY = "paste-to-link.write-token.v1";
  const config = () => root.APP_CONFIG || {};

  function token() {
    try { return sessionStorage.getItem(TOKEN_KEY) || ""; }
    catch (e) { return ""; }
  }

  function setWriteToken(value) {
    try {
      const clean = String(value || "").trim();
      if (clean) sessionStorage.setItem(TOKEN_KEY, clean);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch (e) { /* session storage may be disabled */ }
  }

  async function read() {
    const res = await fetch("/api/notes", { cache: "no-store" });
    if (!res.ok) throw new Error("notes read " + res.status);
    const data = await res.json();
    return Array.isArray(data) ? data : (data && Array.isArray(data.notes) ? data.notes : []);
  }

  async function write(notes) {
    const res = await fetch("/api/notes", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token(),
      },
      body: JSON.stringify({ version: 1, notes }),
    });
    if (!res.ok) throw new Error("notes write " + res.status);
  }

  root.Cloud = {
    enabled: () => !!config().CLOUD_ENABLED,
    canWrite: () => !!config().CLOUD_WRITABLE && (!config().AUTH_REQUIRED || !!token()),
    read,
    write,
    getWriteToken: token,
    setWriteToken,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
