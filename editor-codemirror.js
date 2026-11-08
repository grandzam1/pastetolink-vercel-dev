import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, drawSelection, placeholder } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, undo, redo, indentWithTab } from "@codemirror/commands";
import { indentOnInput, bracketMatching, syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { html } from "@codemirror/lang-html";
import { tags } from "@lezer/highlight";

const theme = EditorView.theme({
  "&": { height: "354px", backgroundColor: "var(--c-panel)", color: "var(--c-text)", border: "1px solid var(--c-border)", borderRadius: "0 0 var(--radius) var(--radius)" },
  "&.cm-focused": { outline: "none", borderColor: "var(--c-primary-border)", boxShadow: "0 0 0 1px var(--c-primary-border)" },
  ".cm-scroller": { overflow: "auto", overscrollBehavior: "contain", fontFamily: "var(--font-mono)", fontSize: "var(--text-base)", lineHeight: "1.65" },
  ".cm-content": { padding: "16px 0", caretColor: "var(--c-link)" },
  ".cm-line": { padding: "0 16px" },
  ".cm-gutters": { backgroundColor: "var(--c-panel)", color: "var(--c-text-muted)", borderColor: "var(--c-border)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--c-link)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": { backgroundColor: "var(--c-raised)" },
  ".cm-placeholder": { color: "var(--c-text-muted)", opacity: "0.6" }
}, { dark: true });

const highlighting = HighlightStyle.define([
  { tag: [tags.tagName, tags.keyword], color: "var(--c-link)" },
  { tag: [tags.attributeName, tags.propertyName], color: "var(--c-warn)" },
  { tag: [tags.string, tags.attributeValue], color: "var(--c-accent-2)" },
  { tag: tags.comment, color: "var(--c-text-muted)", fontStyle: "italic" },
  { tag: [tags.angleBracket, tags.punctuation], color: "var(--c-text-muted)" },
  { tag: [tags.number, tags.bool], color: "var(--c-warn)" }
]);

function create(mount, opts = {}) {
  mount.innerHTML = "";
  const bar = document.createElement("div");
  bar.className = "toolbar";
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Formatting");
  mount.appendChild(bar);

  const extensions = [
    lineNumbers(), drawSelection(), history(), html(), indentOnInput(), bracketMatching(),
    EditorView.lineWrapping, syntaxHighlighting(highlighting), theme,
    placeholder(opts.placeholder || "Write or paste something..."),
    EditorView.contentAttributes.of({ "aria-label": "Note content", "aria-multiline": "true", spellcheck: "false" }),
    keymap.of([
      { key: "Mod-b", run: () => { wrap("strong"); return true; } },
      { key: "Mod-i", run: () => { wrap("em"); return true; } },
      { key: "Mod-k", run: () => { link(); return true; } },
      ...defaultKeymap, ...historyKeymap, indentWithTab
    ]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged && opts.onChange) opts.onChange();
    })
  ];
  const view = new EditorView({ state: EditorState.create({ extensions }), parent: mount });

  function replace(text, from, to, anchor, head) {
    view.dispatch({ changes: { from, to, insert: text }, selection: { anchor, head }, scrollIntoView: true, userEvent: "input" });
    view.focus();
  }

  function wrap(tag) {
    const { from, to } = view.state.selection.main;
    const text = view.state.sliceDoc(from, to);
    const open = "<" + tag + ">";
    replace(open + text + "</" + tag + ">", from, to, from + open.length, from + open.length + text.length);
  }

  function list(tag) {
    const { from, to } = view.state.selection.main;
    const text = view.state.sliceDoc(from, to);
    const open = "<" + tag + ">\n  <li>";
    const content = text.split("\n").join("</li>\n  <li>");
    replace(open + content + "</li>\n</" + tag + ">", from, to, from + open.length, from + open.length + content.length);
  }

  function link() {
    let url = window.prompt("Link address (https://...)", "https://");
    if (!url) return;
    url = url.trim();
    if (!/^(https?:|mailto:)/i.test(url)) {
      if (/^[\w-]+(\.[\w-]+)+/.test(url)) url = "https://" + url;
      else { if (opts.onToast) opts.onToast("That doesn't look like a web address."); return; }
    }
    const { from, to } = view.state.selection.main;
    const text = view.state.sliceDoc(from, to) || Sanitize.escapeHtml(url);
    const open = '<a href="' + Sanitize.escapeHtml(url) + '">';
    replace(open + text + "</a>", from, to, from + open.length, from + open.length + text.length);
  }

  function clear() {
    const { from, to } = view.state.selection.main;
    const text = Sanitize.escapeHtml(Sanitize.toText(view.state.sliceDoc(from, to)));
    replace(text, from, to, from, from + text.length);
  }

  const tools = [
    ["B", "Bold (Ctrl+B)", () => wrap("strong"), "tb-b"],
    ["I", "Italic (Ctrl+I)", () => wrap("em"), "tb-i"],
    ["U", "Underline (Ctrl+U)", () => wrap("u"), "tb-u"],
    ["S", "Strikethrough", () => wrap("s"), "tb-s"], "|",
    ["H1", "Large heading", () => wrap("h1")],
    ["H2", "Small heading", () => wrap("h2")], "|",
    ["• List", "Bulleted list", () => list("ul")],
    ["1. List", "Numbered list", () => list("ol")],
    ["Quote", "Quote", () => wrap("blockquote")],
    ["Code", "Code block", () => wrap("pre")], "|",
    ["Link", "Add link (Ctrl+K)", link],
    ["Clear", "Clear formatting", clear], "|",
    ["Undo", "Undo (Ctrl+Z)", () => { undo(view); view.focus(); }],
    ["Redo", "Redo (Ctrl+Y)", () => { redo(view); view.focus(); }]
  ];
  tools.forEach((tool) => {
    if (tool === "|") {
      const sep = document.createElement("span");
      sep.className = "tb-sep";
      sep.setAttribute("aria-hidden", "true");
      bar.appendChild(sep);
      return;
    }
    const [label, title, run, cls = ""] = tool;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tb-btn " + cls;
    button.textContent = label;
    button.title = title;
    button.setAttribute("aria-label", title);
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", run);
    bar.appendChild(button);
  });

  return {
    getHTML: () => Sanitize.clean(view.state.doc.toString()),
    setHTML: (value) => {
      view.setState(EditorState.create({ doc: Sanitize.clean(value), extensions }));
      view.scrollDOM.scrollTop = 0;
      view.scrollDOM.scrollLeft = 0;
    },
    focus: () => view.focus(),
    destroy: () => view.destroy()
  };
}

window.Editor = { create };
