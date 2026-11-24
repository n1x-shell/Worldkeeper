/** What a template asks for: its facts and sections, each with guidance, an example from the setting, and who sees it. */
import { EyeOff } from 'lucide-react';
import type { TemplateSpec } from '@shared/templates';
import { Badge } from './ui/badges';

export interface ClientTemplate extends TemplateSpec {
  id: string;
  origin: 'builtin' | 'import' | 'user';
  markdown: string;
}

export const ORIGIN_LABEL: Record<ClientTemplate['origin'], string> = { builtin: 'Built-in', import: 'From your archive', user: 'Your own' };

export function TemplatePreview({ template, compact }: { template: TemplateSpec; compact?: boolean }) {
  return (
    <div className="space-y-4 text-sm">
      {template.description && <p className="text-ink/90">{template.description}</p>}
      {template.facts.length > 0 && (
        <div>
          <div className="section-title text-xs! mb-1.5">Facts</div>
          <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[minmax(8rem,auto)_1fr]">
            {template.facts.map((f) => (
              <div key={f.name} className="contents">
                <dt className="font-medium text-ink">{f.name}</dt>
                <dd className="text-dim">
                  {f.guidance}
                  {f.example && !compact && <span className="block italic text-ink/80">e.g. {f.example}</span>}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      <div>
        <div className="section-title text-xs! mb-1.5">Sections</div>
        <ol className="space-y-2.5">
          {template.sections.map((s) => (
            <li key={s.heading}>
              <div className="flex items-center gap-2 font-medium text-ink">
                {s.heading}
                {s.gm && (
                  <Badge tone="danger" icon={<EyeOff size={11} />} title="Never shown to players">
                    GM only
                  </Badge>
                )}
              </div>
              {s.guidance && <p className="text-dim mt-0.5">{s.guidance}</p>}
              {s.example && !compact && (
                <blockquote className="mt-1 border-l-2 border-gold/50 pl-3 italic text-ink/80">
                  “{s.example.text}”{s.example.source && <span className="not-italic text-dim"> ({s.example.source})</span>}
                </blockquote>
              )}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
