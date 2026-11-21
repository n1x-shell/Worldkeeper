/** The growing text area, with record-link suggestions (GM app). */
import { useEffect, useRef } from 'react';
import { useLinkSuggest } from '../LinkSuggest';

/**
 * Text area that grows with its content. Typing `[[` offers record-link suggestions
 * (inserts `Name [ID]`); pass `links={false}` to turn that off.
 */
export function AutoTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number; links?: boolean }) {
  const { minRows = 3, className = '', links = true, onKeyDown, onChange, onBlur, onClick, onKeyUp, ...rest } = props;
  const ref = useRef<HTMLTextAreaElement>(null);
  const suggest = useLinkSuggest(ref, links);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, minRows * 22)}px`;
  }, [props.value, minRows]);
  return (
    <div className="relative">
      <textarea
        ref={ref}
        rows={minRows}
        className={`input font-mono text-[13px] leading-relaxed resize-y ${className}`}
        {...rest}
        onChange={(e) => {
          onChange?.(e);
          suggest.update();
        }}
        onKeyDown={(e) => {
          if (suggest.onKeyDown(e)) return;
          onKeyDown?.(e);
        }}
        onKeyUp={(e) => {
          if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) suggest.update();
          onKeyUp?.(e);
        }}
        onClick={(e) => {
          suggest.update();
          onClick?.(e);
        }}
        onBlur={(e) => {
          setTimeout(suggest.close, 150);
          onBlur?.(e);
        }}
        aria-autocomplete={links ? 'list' : undefined}
        aria-expanded={links ? suggest.open : undefined}
      />
      {suggest.popup}
    </div>
  );
}
