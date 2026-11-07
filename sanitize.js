/*
  Sanitizer: turns any HTML into a small, safe subset.
  Only these tags survive: p, br, strong, em, u, s, h1-h3, ul, ol, li,
  blockquote, code, pre, hr, a (http/https/mailto links only).
  Everything else is unwrapped or removed. All attributes are dropped
  except a safe href on links.
*/
(function (root) {
  const KEEP = {
    B: "strong", STRONG: "strong", I: "em", EM: "em", U: "u",
    S: "s", STRIKE: "s", DEL: "s",
    P: "p", BR: "br", HR: "hr",
    H1: "h1", H2: "h2", H3: "h3", H4: "h3", H5: "h3", H6: "h3",
    UL: "ul", OL: "ol", LI: "li",
    BLOCKQUOTE: "blockquote", CODE: "code", PRE: "pre", A: "a",
  };
  const DROP = new Set([
    "SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "NOSCRIPT", "TEMPLATE",
    "SVG", "MATH", "FORM", "INPUT", "BUTTON", "TEXTAREA", "SELECT",
    "LINK", "META", "TITLE", "HEAD", "IMG", "VIDEO", "AUDIO", "CANVAS",
  ]);
  const BLOCK = new Set([
    "P", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "LI",
    "BLOCKQUOTE", "PRE", "DIV", "HR", "TABLE", "SECTION", "ARTICLE",
  ]);
  const SAFE_HREF = /^(https?:|mailto:)/i;

  function hasBlockChild(n) {
    return Array.from(n.children).some((c) => BLOCK.has(c.tagName.toUpperCase()));
  }

  function walk(src, dest) {
    for (const n of Array.from(src.childNodes)) {
      if (n.nodeType === 3) {
        dest.appendChild(document.createTextNode(n.nodeValue));
        continue;
      }
      if (n.nodeType !== 1) continue;
      const tag = n.tagName.toUpperCase();
      if (DROP.has(tag)) continue;

      let out = KEEP[tag];
      if (tag === "DIV") out = hasBlockChild(n) ? null : "p";
      if (tag === "A") {
        const href = (n.getAttribute("href") || "").trim();
        if (!SAFE_HREF.test(href)) out = null;
      }
      if (!out) {
        walk(n, dest); // unwrap: keep the text, drop the tag
        continue;
      }

      const el = document.createElement(out);
      if (out === "a") {
        el.setAttribute("href", n.getAttribute("href").trim());
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener noreferrer nofollow");
      }
      if (out !== "br" && out !== "hr") walk(n, el);
      dest.appendChild(el);
    }
  }

  function clean(html) {
    const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
    const box = document.createElement("div");
    walk(doc.body, box);
    return box.innerHTML;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Plain text -> paragraphs (one per line, blank lines kept)
  function textToHtml(text) {
    return String(text || "")
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((line) => "<p>" + (line ? escapeHtml(line) : "<br>") + "</p>")
      .join("");
  }

  // HTML -> readable plain text
  function toText(html) {
    const box = document.createElement("div");
    box.innerHTML = clean(html);
    const out = [];
    (function w(node) {
      for (const c of Array.from(node.childNodes)) {
        if (c.nodeType === 3) {
          out.push(c.nodeValue);
        } else if (c.nodeType === 1) {
          const tag = c.tagName;
          if (tag === "BR") { out.push("\n"); continue; }
          if (tag === "HR") { out.push("\n---\n"); continue; }
          if (tag === "LI") out.push(c.parentNode.tagName === "OL" ? "- " : "• ");
          w(c);
          if (/^(P|H1|H2|H3|LI|BLOCKQUOTE|PRE|UL|OL)$/.test(tag)) out.push("\n");
        }
      }
    })(box);
    return out.join("").replace(/\n{3,}/g, "\n\n").trim();
  }

  root.Sanitize = { clean, textToHtml, toText, escapeHtml };
})(typeof globalThis !== "undefined" ? globalThis : window);
