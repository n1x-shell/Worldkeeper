/**
 * The editor's CodeMirror 6 setup (docs/OWN_WORLD_PLAN.md §2.3): Markdown highlighting in the app's fonts and colours
 * (both themes, through the CSS variables), the formatting commands the toolbar and shortcuts share, and `@` record
 * links completed from the library's index.
 */
import { EditorSelection, EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap, placeholder as placeholderExt } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { markdown } from '@codemirror/lang-markdown';
import { autocompletion, completionKeymap, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { tags as t } from '@lezer/highlight';

const v = (name: string, alpha = 1) => (alpha === 1 ? `rgb(var(--${name}))` : `rgb(var(--${name}) / ${alpha})`);

/** The editor in the app's look: the text in the sans font, at reading size, on the input colour. */
export const appTheme = EditorView.theme({
  '&': { color: v('ink'), backgroundColor: v('raised'), fontSize: '14px', borderRadius: '6px' },
  '&.cm-focused': { outline: `2px solid ${v('gold', 0.6)}`, outlineOffset: '1px' },
  '.cm-scroller': { fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', lineHeight: '1.6' },
  '.cm-content': { padding: '8px 10px', caretColor: v('gold') },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: v('gold') },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: `${v('gold', 0.22)} !important` },
  '.cm-placeholder': { color: v('dim'), fontStyle: 'italic' },
  '.cm-tooltip': { backgroundColor: v('panel'), border: `1px solid ${v('line')}`, borderRadius: '6px', boxShadow: '0 8px 24px rgb(0 0 0 / 0.25)' },
  '.cm-tooltip-autocomplete > ul > li': { padding: '4px 10px', fontFamily: 'system-ui, sans-serif' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: v('raised'), color: v('gold') },
  '.cm-completionDetail': { color: v('dim'), fontStyle: 'normal', marginLeft: '8px', fontSize: '11px' },
});

/** Markdown as it will read: headings in the display face, emphasis, quotes, links and code set apart. */
const highlight = HighlightStyle.define([
  { tag: t.heading1, fontFamily: 'Cinzel, Georgia, serif', fontSize: '1.3em', fontWeight: '600', color: v('gold') },
  { tag: t.heading2, fontFamily: 'Cinzel, Georgia, serif', fontSize: '1.15em', fontWeight: '600', color: v('gold') },
  { tag: [t.heading3, t.heading4, t.heading5, t.heading6], fontWeight: '600', color: v('gold') },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.quote, color: v('dim'), fontStyle: 'italic' },
  { tag: [t.link, t.url], color: v('arcane') },
  { tag: t.monospace, fontFamily: 'ui-monospace, monospace', fontSize: '0.92em', color: v('dim') },
  { tag: [t.processingInstruction, t.meta, t.punctuation], color: v('dim', 0.85) },
  { tag: t.list, color: v('gold') },
  { tag: t.contentSeparator, color: v('line') },
]);

// ---------------------------------------------------------------- commands

/** Wrap the selection (or the word at the cursor) in a marker, or unwrap it. */
export function toggleWrap(view: EditorView, mark: string): boolean {
  view.dispatch(
    view.state.changeByRange((range) => {
      let { from, to } = range;
      if (from === to) {
        const word = view.state.wordAt(from);
        if (word) ({ from, to } = word);
      }
      const doc = view.state.doc;
      const before = doc.sliceString(from - mark.length, from);
      const after = doc.sliceString(to, to + mark.length);
      if (before === mark && after === mark)
        return {
          changes: [
            { from: from - mark.length, to: from, insert: '' },
            { from: to, to: to + mark.length, insert: '' },
          ],
          range: EditorSelection.range(from - mark.length, to - mark.length),
        };
      return {
        changes: [
          { from, insert: mark },
          { from: to, insert: mark },
        ],
        range: EditorSelection.range(from + mark.length, to + mark.length),
      };
    }),
  );
  view.focus();
  return true;
}

/** Put a prefix at the start of each selected line ("## ", "- ", "> "), or take it away if every line has it. */
export function toggleLinePrefix(view: EditorView, prefix: string): boolean {
  const { state } = view;
  const lines = new Set<number>();
  for (const r of state.selection.ranges) for (let l = state.doc.lineAt(r.from).number; l <= state.doc.lineAt(r.to).number; l++) lines.add(l);
  const all = [...lines].map((n) => state.doc.line(n));
  const has = all.every((l) => l.text.startsWith(prefix));
  // A heading replaces any heading marker the line already has.
  const strip = (text: string) => (prefix.startsWith('#') ? (/^#{1,6}\s+/.exec(text)?.[0].length ?? 0) : 0);
  view.dispatch({
    changes: all.map((l) => (has ? { from: l.from, to: l.from + prefix.length, insert: '' } : { from: l.from, to: l.from + strip(l.text), insert: prefix })),
  });
  view.focus();
  return true;
}

/** Insert a block (a table, a section) on its own lines at the cursor, and select its first placeholder. */
export function insertBlock(view: EditorView, text: string, select?: string): boolean {
  const { state } = view;
  const pos = state.selection.main.to;
  const line = state.doc.lineAt(pos);
  const before = line.text.trim() ? '\n\n' : line.from > 0 && state.doc.lineAt(line.from - 1).text.trim() ? '\n' : '';
  const insert = `${before}${text}\n`;
  const at = line.text.trim() ? line.to : pos;
  const sel = select ? insert.indexOf(select) : -1;
  view.dispatch({
    changes: { from: at, insert },
    selection: sel >= 0 ? EditorSelection.range(at + sel, at + sel + select!.length) : EditorSelection.cursor(at + insert.length),
    scrollIntoView: true,
  });
  view.focus();
  return true;
}

export const TABLE = '| Column | Column |\n| --- | --- |\n| Text | Text |';
/** A section only the GM sees: the heading the reveal rules treat as GM only (shared/templates.ts). */
export const GM_SECTION = '## Secrets (GM only)\n\nWhat only you know.';

/** Start a record link: an `@` that opens the record search. */
export function startLink(view: EditorView): boolean {
  const pos = view.state.selection.main.head;
  const prev = view.state.doc.sliceString(pos - 1, pos);
  view.dispatch({ changes: { from: pos, insert: prev && !/\s/.test(prev) ? ' @' : '@' }, selection: EditorSelection.cursor(pos + (prev && !/\s/.test(prev) ? 2 : 1)) });
  view.focus();
  return true;
}

// ---------------------------------------------------------------- record links

export interface LinkTarget {
  id: string;
  name: string;
  /** What the link reads as in the text ("@[Name]", with its type when two records share the name). */
  mention: string;
  detail: string;
}

// `@` at the start or after a space or opening punctuation (not in an e-mail address), or `[[`, then the query.
const TRIGGER = /(?:(?:^|[\s(>"'“‘])(@\[?)|(\[\[))([^[\]\n@]{0,60})$/;

/** Completions for `@` and `[[` from the records the app knows. */
export function recordLinks(find: (query: string) => LinkTarget[]) {
  return (ctx: CompletionContext): CompletionResult | null => {
    const line = ctx.state.doc.lineAt(ctx.pos);
    const m = TRIGGER.exec(line.text.slice(0, ctx.pos - line.from));
    if (!m) return null;
    const marker = m[1] ?? m[2];
    const query = m[3];
    // A query that has grown past three words with nothing found is ordinary prose.
    const found = find(query);
    if (query.split(' ').length > 3 && !found.length) return null;
    const from = ctx.pos - query.length - marker.length;
    return {
      from,
      filter: false,
      options: found.map((r) => ({
        label: r.name,
        detail: r.detail,
        apply: (view, _c, f, to) => {
          // Also take a closing ] already typed.
          const end = view.state.doc.sliceString(to, to + 1) === ']' ? to + 1 : to;
          view.dispatch({ changes: { from: f, to: end, insert: r.mention }, selection: EditorSelection.cursor(f + r.mention.length) });
        },
      })),
    };
  };
}

export interface SetupOptions {
  placeholder?: string;
  links?: (query: string) => LinkTarget[];
  onChange: (text: string) => void;
  onBlur?: () => void;
  label?: string;
  readOnly?: boolean;
}

export function editorExtensions(o: SetupOptions): Extension[] {
  return [
    history(),
    markdown(),
    syntaxHighlighting(highlight),
    appTheme,
    EditorView.lineWrapping,
    EditorState.tabSize.of(2),
    o.placeholder ? placeholderExt(o.placeholder) : [],
    o.links ? autocompletion({ override: [recordLinks(o.links)], activateOnTyping: true, icons: false }) : [],
    keymap.of([
      { key: 'Mod-b', run: (v) => toggleWrap(v, '**') },
      { key: 'Mod-i', run: (v) => toggleWrap(v, '*') },
      { key: 'Mod-Alt-2', run: (v) => toggleLinePrefix(v, '## ') },
      { key: 'Mod-Shift-8', run: (v) => toggleLinePrefix(v, '- ') },
      { key: 'Mod-Shift-9', run: (v) => toggleLinePrefix(v, '> ') },
      { key: 'Mod-k', run: startLink },
      ...completionKeymap,
      ...historyKeymap,
      ...defaultKeymap,
    ]),
    EditorView.updateListener.of((u) => {
      if (u.docChanged) o.onChange(u.state.doc.toString());
      if (u.focusChanged && !u.view.hasFocus) o.onBlur?.();
    }),
    EditorView.contentAttributes.of({ 'aria-label': o.label ?? 'Text', 'aria-multiline': 'true', spellcheck: 'true' }),
    o.readOnly ? EditorState.readOnly.of(true) : [],
  ];
}
