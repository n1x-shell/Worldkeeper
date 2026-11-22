/**
 * The Markdown editor for every long text in the GM app (docs/OWN_WORLD_PLAN.md §2.3), built on CodeMirror 6:
 * highlighting as you type, a toolbar and shortcuts (bold, italic, heading, list, quote, table, record link, GM-only
 * section), `@` record links, and, in its full form, Write, Preview and Split (remembered on this device), a section
 * outline for long texts and full screen. It is controlled like a text area: `value` in, `onChange(text)` out, so
 * autosave, save status and conflict protection work as they did.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { Bold, Columns2, Eye, Heading2, Italic, Link2, List, ListTree, Lock, Maximize2, Minimize2, PenLine, Quote, Table } from 'lucide-react';
import { useAppState } from '../../lib/store';
import { rankRecords } from '../../lib/rank';
import { useRecordTypes } from '../recordTypes';
import { Markdown } from '../Markdown';
import { GM_SECTION, TABLE, editorExtensions, insertBlock, startLink, toggleLinePrefix, toggleWrap, type LinkTarget } from './codemirror';

export type EditorMode = 'write' | 'preview' | 'split';
const MODE_KEY = 'wk.editor.mode';
const readMode = (): EditorMode => {
  try {
    const m = localStorage.getItem(MODE_KEY);
    return m === 'preview' || m === 'split' ? m : 'write';
  } catch {
    return 'write';
  }
};

export interface MarkdownEditorProps {
  value: string;
  onChange: (text: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  /** Rows of text it shows before it grows. */
  minRows?: number;
  /** The full editor: toolbar, Write/Preview/Split, outline and full screen. Otherwise a compact one (shortcuts only). */
  full?: boolean;
  /** Offer `@` record links (default on). */
  links?: boolean;
  label?: string;
  className?: string;
  autoFocus?: boolean;
}

/** The headings of a text, for the outline. */
const outlineOf = (text: string) =>
  text.split('\n').flatMap((l, i) => {
    const m = /^(#{1,4})\s+(.+?)\s*$/.exec(l);
    return m ? [{ line: i + 1, depth: m[1].length, title: m[2] }] : [];
  });

export function MarkdownEditor({ value, onChange, onBlur, placeholder, minRows = 3, full = false, links = true, label, className = '', autoFocus }: MarkdownEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const { index, mentions } = useAppState();
  const recordTypes = useRecordTypes();
  const [mode, setModeState] = useState<EditorMode>(() => (full ? readMode() : 'write'));
  const [fullscreen, setFullscreen] = useState(false);
  const [showOutline, setShowOutline] = useState(true);

  // The latest callbacks and lookups, read by the editor without rebuilding it.
  const latest = useRef({ onChange, onBlur, index, mentions, recordTypes });
  latest.current = { onChange, onBlur, index, mentions, recordTypes };
  const find = useMemo(
    () =>
      (query: string): LinkTarget[] => {
        const { index: idx, mentions: m, recordTypes: rt } = latest.current;
        return rankRecords(idx.values(), query).map((e) => ({ id: e.id, name: e.name, mention: m.mentionFor(e.id), detail: rt.label(e.type) }));
      },
    [],
  );

  useEffect(() => {
    if (!host.current) return;
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: editorExtensions({
          placeholder,
          label,
          links: links ? find : undefined,
          onChange: (text) => latest.current.onChange(text),
          onBlur: () => latest.current.onBlur?.(),
        }),
      }),
    });
    view.current = v;
    if (autoFocus) v.focus();
    return () => {
      v.destroy();
      view.current = null;
    };
    // The editor is built once; its text follows `value` below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A value changed from outside (a reload, a revert, a merge): put it in, keeping the cursor where it can be.
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const now = v.state.doc.toString();
    if (now === value) return;
    const head = Math.min(v.state.selection.main.head, value.length);
    v.dispatch({ changes: { from: 0, to: now.length, insert: value }, selection: { anchor: head } });
  }, [value]);

  const setMode = (m: EditorMode) => {
    setModeState(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* per-device only */
    }
  };
  const run = (f: (v: EditorView) => boolean) => () => view.current && f(view.current);
  const outline = full ? outlineOf(value) : [];
  const jump = (line: number) => {
    const v = view.current;
    if (!v) return;
    if (mode === 'preview') setMode('split');
    const pos = v.state.doc.line(Math.min(line, v.state.doc.lines)).from;
    v.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 24 }) });
    v.focus();
  };

  const minHeight = `${Math.max(2, minRows) * 1.6 + 1}em`;
  const tools: [string, React.ReactNode, () => void, string?][] = [
    ['Bold', <Bold key="b" size={14} />, run((v) => toggleWrap(v, '**')), 'Ctrl+B'],
    ['Italic', <Italic key="i" size={14} />, run((v) => toggleWrap(v, '*')), 'Ctrl+I'],
    ['Heading', <Heading2 key="h" size={14} />, run((v) => toggleLinePrefix(v, '## ')), 'Ctrl+Alt+2'],
    ['List', <List key="l" size={14} />, run((v) => toggleLinePrefix(v, '- ')), 'Ctrl+Shift+8'],
    ['Quote', <Quote key="q" size={14} />, run((v) => toggleLinePrefix(v, '> ')), 'Ctrl+Shift+9'],
    ['Table', <Table key="t" size={14} />, run((v) => insertBlock(v, TABLE, 'Column'))],
    ...(links ? ([['Link a record', <Link2 key="k" size={14} />, run(startLink), 'Ctrl+K or @']] as [string, React.ReactNode, () => void, string?][]) : []),
    ['GM-only section', <Lock key="g" size={14} />, run((v) => insertBlock(v, GM_SECTION, 'What only you know.'))],
  ];

  const editorBox = (
    <div
      ref={host}
      className={`min-w-0 rounded-md border border-edge/60 ${mode === 'preview' ? 'hidden' : ''} ${fullscreen ? 'flex-1 overflow-auto' : ''}`}
      style={{ minHeight: fullscreen ? undefined : minHeight }}
      onClick={() => view.current?.focus()}
    />
  );

  if (!full)
    return (
      <div className={className} data-editor="markdown">
        {editorBox}
      </div>
    );

  return (
    <div
      className={`${fullscreen ? 'fixed inset-0 z-[1800] bg-bg p-4 flex flex-col gap-2' : 'space-y-1'} ${className}`}
      data-editor="markdown"
      data-full=""
      data-fullscreen={fullscreen ? '' : undefined}
    >
      <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label="Formatting">
        {mode !== 'preview' &&
          tools.map(([name, icon, onClick, keys]) => (
            <button key={name} type="button" className="btn-ghost h-8 w-8 p-0 justify-center" title={keys ? `${name} (${keys})` : name} aria-label={name} onClick={onClick}>
              {icon}
            </button>
          ))}
        <span className="ml-auto flex items-center gap-1">
          <span className="inline-flex rounded-md border border-line overflow-hidden" role="group" aria-label="View">
            {(
              [
                ['write', 'Write', <PenLine key="w" size={13} />],
                ['split', 'Split', <Columns2 key="s" size={13} />],
                ['preview', 'Preview', <Eye key="p" size={13} />],
              ] as [EditorMode, string, React.ReactNode][]
            ).map(([m, l, icon]) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                className={`px-2 h-8 text-xs inline-flex items-center gap-1 ${mode === m ? 'bg-gold/15 text-gold' : 'text-dim hover:text-ink'}`}
                onClick={() => setMode(m)}
              >
                {icon} {l}
              </button>
            ))}
          </span>
          {outline.length > 2 && (
            <button
              type="button"
              className={`btn-ghost h-8 w-8 p-0 justify-center ${showOutline ? 'text-gold' : ''}`}
              title="Outline"
              aria-label="Outline"
              aria-pressed={showOutline}
              onClick={() => setShowOutline(!showOutline)}
            >
              <ListTree size={14} />
            </button>
          )}
          <button
            type="button"
            className="btn-ghost h-8 w-8 p-0 justify-center"
            title={fullscreen ? 'Leave full screen (Esc)' : 'Full screen'}
            aria-label={fullscreen ? 'Leave full screen' : 'Full screen'}
            onClick={() => setFullscreen(!fullscreen)}
          >
            {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </span>
      </div>
      <div
        className={`flex gap-3 ${fullscreen ? 'flex-1 min-h-0' : ''}`}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && fullscreen) setFullscreen(false);
        }}
      >
        {outline.length > 2 && showOutline && (
          <nav aria-label="Outline" className={`hidden lg:block w-44 shrink-0 text-xs space-y-0.5 ${fullscreen ? 'overflow-auto' : 'max-h-[70vh] overflow-auto sticky top-2 self-start'}`}>
            {outline.map((o) => (
              <button
                key={o.line}
                type="button"
                className="block w-full truncate text-left text-dim hover:text-gold"
                style={{ paddingLeft: (o.depth - 1) * 10 }}
                onClick={() => jump(o.line)}
                title={o.title}
              >
                {o.title}
              </button>
            ))}
          </nav>
        )}
        <div className={`flex-1 min-w-0 grid gap-3 ${mode === 'split' ? 'md:grid-cols-2' : ''} ${fullscreen ? 'min-h-0' : ''}`}>
          {editorBox}
          {mode !== 'write' && (
            <div className={`min-w-0 rounded-md border border-line bg-panel px-4 py-3 ${fullscreen ? 'overflow-auto' : 'max-h-[70vh] overflow-auto self-start'}`} aria-label="Preview">
              {value.trim() ? <Markdown text={value} /> : <p className="text-sm text-dim italic">Nothing to preview yet.</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
