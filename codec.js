/*
  Codec: turns text into a URL-safe string and back. No backend needed.

  Format of the string after "#":
    "z" + base64url(deflate-raw(utf8 text))   compressed (used when shorter)
    "r" + base64url(utf8 text)                 raw (fallback)
*/
(function (root) {
  function toB64Url(bytes) {
    let s = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function fromB64Url(str) {
    str = str.replace(/-/g, "+").replace(/_/g, "/");
    while (str.length % 4) str += "=";
    const bin = atob(str);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function pipe(bytes, transform) {
    const stream = new Blob([bytes]).stream().pipeThrough(transform);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function encode(text) {
    const raw = new TextEncoder().encode(text);
    const rawStr = toB64Url(raw);
    if (typeof CompressionStream === "undefined") return "r" + rawStr;
    const zipped = await pipe(raw, new CompressionStream("deflate-raw"));
    const zipStr = toB64Url(zipped);
    return zipStr.length < rawStr.length ? "z" + zipStr : "r" + rawStr;
  }

  async function decode(data) {
    if (!data || data.length < 2) throw new Error("empty");
    const kind = data[0];
    const bytes = fromB64Url(data.slice(1));
    let out;
    if (kind === "z") {
      if (typeof DecompressionStream === "undefined") {
        throw new Error("unsupported");
      }
      out = await pipe(bytes, new DecompressionStream("deflate-raw"));
    } else if (kind === "r") {
      out = bytes;
    } else {
      throw new Error("unknown format");
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(out);
  }

  root.Codec = { encode, decode };
  if (typeof module !== "undefined") module.exports = root.Codec;
})(typeof globalThis !== "undefined" ? globalThis : window);
