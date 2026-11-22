/** Long text in the GM app: the Markdown editor (components/editor), used like a text area. */
import { lazy, Suspense, type KeyboardEvent } from 'react';

// The editor (CodeMirror and its Markdown support) loads on first use, so the app's first page stays quick.
const MarkdownEditor = lazy(() => import('../editor/MarkdownEditor').then((m) => ({ default: m.MarkdownEditor })));

type TextChange = { target: { value: string }; currentTarget: { value: string } };

/**
 * The editor (CodeMirror 6) with a text area's props, so every page's long text gets highlighting, shortcuts and `@`
 * record links. `full` adds the toolbar, Write/Preview/Split, the outline and full screen, for records, scenes,
 * recaps, notes and handouts. `links={false}` turns record links off. `onKeyDown` sees keys before the editor does,
 * so a page's own shortcut (Ctrl+Enter to save) still works. Until the editor has loaded, a plain text area stands in.
 */
export function AutoTextarea(props: {
  value?: string | number | readonly string[];
  onChange?: (e: TextChange) => void;
  onBlur?: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLElement>) => void;
  placeholder?: string;
  minRows?: number;
  links?: boolean;
  full?: boolean;
  className?: string;
  autoFocus?: boolean;
  'aria-label'?: string;
}) {
  const { value = '', onChange, onBlur, onKeyDown, placeholder, minRows = 3, links = true, full = false, className = '', autoFocus } = props;
  const text = String(value ?? '');
  const change = (v: string) => onChange?.({ target: { value: v }, currentTarget: { value: v } });
  const fallback = (
    <textarea
      className="input w-full leading-relaxed"
      rows={minRows}
      value={text}
      placeholder={placeholder}
      aria-label={props['aria-label']}
      onChange={(e) => change(e.target.value)}
      onBlur={onBlur}
    />
  );
  return (
    <div
      onKeyDownCapture={
        onKeyDown
          ? (e) => {
              onKeyDown(e);
              if (e.defaultPrevented) e.stopPropagation();
            }
          : undefined
      }
    >
      <Suspense fallback={fallback}>
        <MarkdownEditor
          value={text}
          onChange={change}
          onBlur={onBlur}
          placeholder={placeholder}
          minRows={minRows}
          links={links}
          full={full}
          label={props['aria-label']}
          autoFocus={autoFocus}
          className={className.replace(/\b(input|font-mono|font-sans|text-sm|text-\[\d+px\]|min-h-\d+)\b/g, '').trim()}
        />
      </Suspense>
    </div>
  );
}
