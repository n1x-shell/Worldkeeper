/** Badges and tags: canon status, realm, record type, reveal state, rarity and plain status. */
import type { ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { ENTITY_TYPE_LABELS, REALM_LABELS, type EntityType, type Realm } from '@shared/domain';

export type Tone = 'dim' | 'gold' | 'arcane' | 'danger' | 'ok' | 'warn' | 'belief' | 'homebrew' | 'aetheris' | 'kaelmar' | 'ethereal' | 'world';

const TONES: Record<Tone, string> = {
  dim: 'border-line text-dim',
  gold: 'border-gold/50 text-gold bg-gold/10',
  arcane: 'border-arcane/60 text-arcane bg-arcane/10',
  danger: 'border-danger/60 text-danger bg-danger/10',
  ok: 'border-ok/60 text-ok bg-ok/10',
  warn: 'border-warn/50 text-warn bg-warn/10',
  belief: 'border-belief/50 text-belief bg-belief/10',
  homebrew: 'border-homebrew/50 text-homebrew bg-homebrew/10',
  aetheris: 'border-realm-aetheris/50 text-realm-aetheris',
  kaelmar: 'border-realm-kaelmar/50 text-realm-kaelmar',
  ethereal: 'border-realm-ethereal/50 text-realm-ethereal',
  world: 'border-realm-world/50 text-realm-world',
};

/** A small rounded label. Use a tone, never a raw colour. */
export function Badge({ tone = 'dim', icon, title, className = '', children }: { tone?: Tone; icon?: ReactNode; title?: string; className?: string; children: ReactNode }) {
  return (
    <span className={`chip ${TONES[tone]} ${className}`} title={title}>
      {icon}
      {children}
    </span>
  );
}

const CANON_TONES: Record<string, Tone> = {
  CANON: 'gold',
  PROPOSED: 'arcane',
  CONFLICT: 'danger',
  UNDEFINED: 'dim',
  RUMOR: 'warn',
  BELIEF: 'belief',
  SECRET: 'danger',
  HOMEBREW: 'homebrew',
  UNVERIFIED: 'warn',
  OFFICIAL: 'ok',
  'OUTSIDE 2024 CORE': 'warn',
};

export function CanonBadge({ status }: { status: string }) {
  return <Badge tone={CANON_TONES[status] ?? 'dim'}>{status}</Badge>;
}

export function CanonFlags({ status, flags }: { status: string; flags: string[] }) {
  const all = [status, ...flags.filter((f) => f !== status)];
  return (
    <span className="inline-flex flex-wrap gap-1">
      {all.map((f) => (
        <CanonBadge key={f} status={f} />
      ))}
    </span>
  );
}

const REALMS = new Set<Tone>(['aetheris', 'kaelmar', 'ethereal', 'world']);
export function RealmBadge({ realm }: { realm: string }) {
  return <Badge tone={REALMS.has(realm as Tone) ? (realm as Tone) : 'dim'}>{REALM_LABELS[realm as Realm] ?? realm}</Badge>;
}

export function TypeBadge({ type }: { type: string }) {
  return <Badge>{ENTITY_TYPE_LABELS[type as EntityType] ?? type}</Badge>;
}

export function VisibilityBadge({ revealed }: { revealed: boolean }) {
  return revealed ? (
    <Badge tone="ok" icon={<Eye size={11} />} title="Revealed to players">
      Revealed
    </Badge>
  ) : (
    <Badge icon={<EyeOff size={11} />} title="DM only">
      DM only
    </Badge>
  );
}

const RARITY_CLASS: Record<string, string> = {
  common: 'rarity-common',
  uncommon: 'rarity-uncommon',
  rare: 'rarity-rare',
  'very rare': 'rarity-very-rare',
  legendary: 'rarity-legendary',
  artifact: 'rarity-artifact',
};
/** An item's rarity, in its colour. Unknown rarities show plainly. */
export function RarityTag({ rarity }: { rarity: string }) {
  const k = rarity.trim().toLowerCase();
  return <span className={`tag capitalize ${RARITY_CLASS[k] ?? 'border-line text-dim'}`}>{rarity}</span>;
}
