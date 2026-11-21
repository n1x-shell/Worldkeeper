/**
 * What an item does, from the GM's books (rules packs): for the character sheet's equipment and attunement, and the
 * party's treasure. Only on the GM's own servers; the published handbook has no books, so it shows nothing.
 */
import { useEffect, useState } from 'react';
import { ScrollText } from 'lucide-react';

export interface BookItem {
  name: string;
  type: string;
  rarity: string;
  attunement: string;
  magic: boolean;
  value: number | null;
  weight: number | null;
  text: string;
  source: string;
}

const cache = new Map<string, BookItem | null>();
/** Look several names up at once; names already looked up come from memory. */
export async function lookupItems(names: string[]): Promise<Record<string, BookItem | null>> {
  const want = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const missing = want.filter((n) => !cache.has(n));
  if (missing.length) {
    try {
      const r = await fetch(`/api/player/items?names=${encodeURIComponent(missing.join('\n'))}`);
      const got = r.ok && (r.headers.get('content-type') ?? '').includes('json') ? ((await r.json()) as Record<string, BookItem | null>) : {};
      for (const n of missing) cache.set(n, got[n] ?? null);
    } catch {
      for (const n of missing) cache.set(n, null);
    }
  }
  return Object.fromEntries(want.map((n) => [n, cache.get(n) ?? null]));
}

/** "Bag of Holding (uncommon, wondrous item)" etc. */
export function itemLine(i: BookItem) {
  return [i.type, i.rarity, i.attunement].filter(Boolean).join(', ');
}

/** One item's rules, folded. */
export function ItemCard({ item, label }: { item: BookItem; label?: string }) {
  return (
    <details className="rounded border border-line/70 px-2 py-1 text-sm">
      <summary className="cursor-pointer">
        <span className="font-medium">{label ?? item.name}</span> <span className="text-xs text-dim">{itemLine(item)}</span>
      </summary>
      <p className="whitespace-pre-line mt-1">{item.text}</p>
      <p className="text-xs text-dim mt-1 num">{[item.weight != null && `${item.weight} lb.`, item.value != null && `${item.value} GP`, item.source].filter(Boolean).join(' · ')}</p>
    </details>
  );
}

/** The rules for whichever of these names the GM's books know. Renders nothing when none match. */
export function ItemRulesList({ names, title = 'What these do' }: { names: string[]; title?: string }) {
  const [found, setFound] = useState<[string, BookItem][]>([]);
  const key = names
    .map((n) => n.trim())
    .filter(Boolean)
    .join('\n');
  useEffect(() => {
    let live = true;
    const t = setTimeout(async () => {
      const r = await lookupItems(key.split('\n'));
      if (live) setFound(Object.entries(r).filter((e): e is [string, BookItem] => !!e[1]));
    }, 400);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [key]);
  if (!found.length) return null;
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-wider text-dim flex items-center gap-1.5">
        <ScrollText size={12} /> {title}
      </div>
      {found.map(([n, i]) => (
        <ItemCard key={n} item={i} label={n} />
      ))}
    </div>
  );
}

/** A line of equipment as an item name: "2 Daggers" stays (the lookup handles counts), "Rope (50 ft.)" too. */
export const equipmentNames = (text: string) =>
  text
    .split(/\n|;/)
    .map((l) => l.replace(/^[-•*]\s*/, '').trim())
    .filter(Boolean);
