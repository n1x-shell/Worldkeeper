import { useCallback, useMemo, useState, type RefObject } from 'react';
import { ENTITY_TYPE_LABELS, type EntityType } from '@shared/domain';
import { useAppState } from '../lib/store';
import type { EntitySummary } from '../lib/types';
import { rankRecords } from '../lib/rank';

/**
 * Record-link suggestions while typing.
 * Typing `[[` followed by part of a name or ID opens a list of matching records; choosing one replaces the
 * `[[query` with the library's own reference format, `Name [ID]`. Works in any textarea via `useLinkSuggest`.
 */

const TRIGGER = /\[\[([^\[\]\n]{0,60})$/;

/** Pixel position of the caret inside a textarea (mirror-element technique). */
export function caretPosition(el: HTMLTextAreaElement, index: number): { top: number; left: number; height: number } {
  const div = document.createElement('div');
  const cs = window.getComputedStyle(el);
  const props = [
    'boxSizing', 'width', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'paddingTop', 'paddingRight', 'paddingBottom',
    'paddingLeft', 'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'lineHeight', 'fontFamily', 'textAlign', 'textTransform',
    'textIndent', 'letterSpacing', 'wordSpacing', 'tabSize',
  ] as const;
  for (const p of props) (div.style as unknown as Record<string, string>)[p] = cs[p];
  div.style.position = 'absolute';
  div.style.visibility = 'hidden';
  div.style.whiteSpace = 'pre-wrap';
  div.style.overflowWrap = 'break-word';
  div.style.top = '0';
  div.style.left = '-9999px';
  div.textContent = el.value.slice(0, index);
  const span = document.createElement('span');
  span.textContent = el.value.slice(index) || '.';
  div.appendChild(span);
  document.body.appendChild(div);
  const top = span.offsetTop + parseInt(cs.borderTopWidth) - el.scrollTop;
  const left = span.offsetLeft + parseInt(cs.borderLeftWidth) - el.scrollLeft;
  const height = parseInt(cs.lineHeight) || parseInt(cs.fontSize) * 1.4;
  document.body.removeChild(div);
  return { top, left, height };
}

/** Set a textarea's value the way a user edit would, so React's onChange fires and undo history is kept where supported. */
export function replaceRange(el: HTMLTextAreaElement, start: number, end: number, text: string) {
  el.focus();
  el.setSelectionRange(start, end);
  // execCommand keeps the browser's undo stack; fall back to the native setter.
  const ok = typeof document.execCommand === 'function' && document.execCommand('insertText', false, text);
  if (!ok || el.value.slice(start, start + text.length) !== text) {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    setter.call(el, el.value.slice(0, start) + text + el.value.slice(end));
    el.setSelectionRange(start + text.length, start + text.length);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

export function useLinkSuggest(ref: RefObject<HTMLTextAreaElement | null>, enabled = true) {
  const { index } = useAppState();
  const [state, setState] = useState<{ start: number; query: string; top: number; left: number } | null>(null);
  const [hi, setHi] = useState(0);
  const results = useMemo(() => (state ? rankRecords(index.values(), state.query) : []), [state, index]);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const caret = el.selectionStart;
    if (caret !== el.selectionEnd) return setState(null);
    const m = TRIGGER.exec(el.value.slice(0, caret));
    if (!m) return setState(null);
    const pos = caretPosition(el, caret);
    setState((prev) => {
      if (!prev || prev.start !== caret - m[0].length) setHi(0);
      return { start: caret - m[0].length, query: m[1], top: pos.top + pos.height + 4, left: Math.min(pos.left, el.clientWidth - 280) };
    });
  }, [ref, enabled]);

  const choose = useCallback(
    (e: EntitySummary) => {
      const el = ref.current;
      if (!el || !state) return;
      replaceRange(el, state.start, el.selectionStart, `${e.name} [${e.id}]`);
      setState(null);
    },
    [ref, state],
  );

  /** Returns true when the key was handled by the suggestion list. */
  const onKeyDown = useCallback(
    (ev: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!state || !results.length) return false;
      if (ev.key === 'ArrowDown') setHi((h) => Math.min(h + 1, results.length - 1));
      else if (ev.key === 'ArrowUp') setHi((h) => Math.max(h - 1, 0));
      else if (ev.key === 'Enter' || ev.key === 'Tab') choose(results[Math.min(hi, results.length - 1)]);
      else if (ev.key === 'Escape') setState(null);
      else return false;
      ev.preventDefault();
      return true;
    },
    [state, results, hi, choose],
  );

  const popup =
    state && results.length ? (
      <ul
        role="listbox"
        aria-label="Link a record"
        className="absolute z-[1600] w-72 panel shadow-2xl py-1 max-h-64 overflow-auto"
        style={{ top: state.top, left: Math.max(0, state.left) }}
        onMouseDown={(e) => e.preventDefault()}
      >
        <li className="px-3 py-1 text-[10px] uppercase tracking-wider text-dim">Link a record · Enter to insert · Esc to close</li>
        {results.map((e, i) => (
          <li
            key={e.id}
            role="option"
            aria-selected={i === hi}
            onMouseEnter={() => setHi(i)}
            onClick={() => choose(e)}
            className={`px-3 py-1.5 cursor-pointer text-sm flex justify-between gap-2 ${i === hi ? 'bg-raised text-gold' : ''}`}
          >
            <span className="truncate font-sans">{e.name}</span>
            <span className="text-[11px] text-dim shrink-0 font-sans">
              {ENTITY_TYPE_LABELS[e.type as EntityType] ?? e.type} · {e.id}
            </span>
          </li>
        ))}
      </ul>
    ) : state ? (
      <div className="absolute z-[1600] panel px-3 py-1.5 text-xs text-dim shadow-xl" style={{ top: state.top, left: Math.max(0, state.left) }}>
        No record matches “{state.query}”
      </div>
    ) : null;

  return { update, onKeyDown, popup, close: () => setState(null), open: !!state };
}
