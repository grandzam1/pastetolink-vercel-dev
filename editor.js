/*
  Rich-text editor: a toolbar plus an editable area.
  Output is always run through Sanitize, so only safe formatting is kept.
*/
(function (root) {
  function el(tag, cls) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }

  function create(mount, opts) {
    opts = opts || {};
    mount.innerHTML = "";

    const bar = el("div", "toolbar");
    bar.setAttribute("role", "toolbar");
    bar.setAttribute("aria-label", "Formatting");

    const area = el("div", "rte rte-editable");
    area.contentEditable = "true";
    area.setAttribute("role", "textbox");
    area.setAttribute("aria-multiline", "true");
    area.setAttribute("aria-label", "Note content");
    area.dataset.placeholder = opts.placeholder || "Write or paste something...";
    area.spellcheck = true;
    mount.append(bar, area);

    try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch (e) {}

    function changed() {
      const h = area.innerHTML;
      if (h === "<br>" || h === "<p><br></p>") area.innerHTML = "";
      if (opts.onChange) opts.onChange();
      refresh();
    }

    function exec(cmd, val) {
      area.focus();
      document.execCommand(cmd, false, val);
      changed();
    }

    function block(tag) {
      area.focus();
      const cur = String(document.queryCommandValue("formatBlock") || "")
        .toLowerCase().replace(/[<>]/g, "");
      document.execCommand("formatBlock", false, "<" + (cur === tag ? "p" : tag) + ">");
      changed();
    }

    function link() {
      area.focus();
      const sel = window.getSelection();
      const saved = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
      let url = window.prompt("Link address (https://...)", "https://");
      if (!url) return;
      url = url.trim();
      if (!/^(https?:|mailto:)/i.test(url)) {
        if (/^[\w-]+(\.[\w-]+)+/.test(url)) url = "https://" + url;
        else { if (opts.onToast) opts.onToast("That doesn't look like a web address."); return; }
      }
      area.focus();
      if (saved) { sel.removeAllRanges(); sel.addRange(saved); }
      if (!saved || saved.collapsed) {
        const safe = Sanitize.escapeHtml(url);
        document.execCommand("insertHTML", false, '<a href="' + safe + '">' + safe + "</a>");
      } else {
        document.execCommand("createLink", false, url);
      }
      changed();
    }

    function clear() {
      area.focus();
      document.execCommand("removeFormat");
      document.execCommand("unlink");
      document.execCommand("formatBlock", false, "<p>");
      changed();
    }

    const tools = [
      { label: "B", title: "Bold (Ctrl+B)", cls: "tb-b", run: () => exec("bold"), state: "bold" },
      { label: "I", title: "Italic (Ctrl+I)", cls: "tb-i", run: () => exec("italic"), state: "italic" },
      { label: "U", title: "Underline (Ctrl+U)", cls: "tb-u", run: () => exec("underline"), state: "underline" },
      { label: "S", title: "Strikethrough", cls: "tb-s", run: () => exec("strikeThrough"), state: "strikeThrough" },
      "|",
      { label: "H1", title: "Large heading", run: () => block("h1") },
      { label: "H2", title: "Small heading", run: () => block("h2") },
      "|",
      { label: "• List", title: "Bulleted list", run: () => exec("insertUnorderedList"), state: "insertUnorderedList" },
      { label: "1. List", title: "Numbered list", run: () => exec("insertOrderedList"), state: "insertOrderedList" },
      { label: "Quote", title: "Quote", run: () => block("blockquote") },
      { label: "Code", title: "Code block", run: () => block("pre") },
      "|",
      { label: "Link", title: "Add link (Ctrl+K)", run: link },
      { label: "Clear", title: "Clear formatting", run: clear },
      "|",
      { label: "Undo", title: "Undo (Ctrl+Z)", run: () => exec("undo") },
      { label: "Redo", title: "Redo (Ctrl+Y)", run: () => exec("redo") },
    ];

    const stateBtns = [];
    tools.forEach((t) => {
      if (t === "|") {
        const s = el("span", "tb-sep");
        s.setAttribute("aria-hidden", "true");
        bar.appendChild(s);
        return;
      }
      const b = el("button", "tb-btn " + (t.cls || ""));
      b.type = "button";
      b.textContent = t.label;
      b.title = t.title;
      b.setAttribute("aria-label", t.title);
      // keep the text selection while clicking toolbar buttons
      b.addEventListener("mousedown", (e) => e.preventDefault());
      b.addEventListener("click", t.run);
      bar.appendChild(b);
      if (t.state) stateBtns.push([b, t.state]);
    });

    function refresh() {
      const sel = window.getSelection();
      if (!sel.rangeCount || !area.contains(sel.anchorNode)) return;
      stateBtns.forEach(([b, s]) => {
        let on = false;
        try { on = document.queryCommandState(s); } catch (e) {}
        b.classList.toggle("is-on", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }

    area.addEventListener("input", changed);
    area.addEventListener("keyup", refresh);
    area.addEventListener("mouseup", refresh);
    document.addEventListener("selectionchange", refresh);

    area.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        link();
      }
    });

    // Paste: keep only safe formatting; plain text becomes paragraphs
    area.addEventListener("paste", (e) => {
      const cd = e.clipboardData;
      if (!cd) return;
      e.preventDefault();
      const html = cd.getData("text/html");
      const text = cd.getData("text/plain");
      let ins = html ? Sanitize.clean(html) : "";
      if (!Sanitize.toText(ins) && text) ins = Sanitize.textToHtml(text);
      if (!ins) return;
      document.execCommand("insertHTML", false, ins);
      changed();
    });

    area.addEventListener("drop", (e) => {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
        e.preventDefault();
      }
    });

    return {
      getHTML: () => Sanitize.clean(area.innerHTML),
      setHTML: (h) => { area.innerHTML = Sanitize.clean(h); },
      focus: () => area.focus(),
      destroy: () => document.removeEventListener("selectionchange", refresh),
    };
  }

  root.Editor = { create };
})(typeof globalThis !== "undefined" ? globalThis : window);
