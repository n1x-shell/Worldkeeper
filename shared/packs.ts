/**
 * Setting packs (docs/OWN_WORLD_PLAN.md §2.0, §2.10): a folder in one format, which anyone could write, holding a
 * setting's realms, record types, templates, content, roles and rules. `pack.json` is its manifest. The Worldkeeper
 * setting is the first pack (packs/worldkeeper). The app's code knows nothing about any pack's world: it reads this.
 */
import type { RealmColor, RealmIcon, RealmKind } from './realms.js';
import type { RecordTypeDef } from './recordTypes.js';
import type { RankLadderSpec } from './standing.js';

/** A regular expression written as data (its source and flags). */
export interface PatternSpec {
  pattern: string;
  flags?: string;
}

export interface PackRealm {
  id: string;
  name: string;
  kind: RealmKind;
  parent_id: string | null;
  color: RealmColor;
  icon: RealmIcon;
  sort_order: number;
}

/** How the pack's own archive reads: its folder layout, Category and realm wording, and ID prefixes. */
export interface ImportProfile {
  about?: string;
  /** File-path patterns (lower case) that mark an import as this pack's archive. */
  detect: string[];
  /** How the archive's files are classified, in order (lower-case path patterns). */
  files: { pattern: string; kind: string; onlyWithoutRecords?: boolean }[];
  /** The file that says which file holds each record's authoritative copy. */
  locator?: string;
  /** Category wording, in order (lower-case patterns), read before the type registry. */
  categoryRules: { pattern: string; type: string }[];
  /** Records whose type is fixed by their ID. */
  idTypes: Record<string, string>;
  /** The type an ID prefix means, when nothing else says (optionally only for some IDs or Category wording). */
  prefixTypes: Record<string, string | { type: string; ids?: string[]; category?: string; else: string }>;
  /** Realm ids, by a word in the realm field that names them. */
  realmNames: Record<string, string>;
  /** Realm-field wording that names no realm ("Both", "All"). */
  notARealm?: string;
  /** A part of the realm field that says where a record really is. */
  realmFocus?: string;
  /** The archive's World Timeline file (a lower-case path pattern). */
  timelineFile?: string;
  /** Records that are a domain's own record, by realm (their landmarks follow them). */
  domainRecords?: Record<string, string>;
  /** The world's eras in order (era/ tag keys), when no file in the archive lists them. */
  eras?: string[];
}

/** The archive's notes about its own sources, hidden outside debug mode on this pack's records only. */
export interface CleaningRules {
  about?: string;
  sourceTag?: PatternSpec;
  citation?: PatternSpec;
  sourcePhrases?: (PatternSpec & { to: string })[];
  metaSentence?: PatternSpec;
  sourceOnlyHeading?: PatternSpec;
  editorialHeading?: PatternSpec;
}

/** Which sections of the pack's records the published handbook shows. */
export interface HandbookRules {
  about?: string;
  editorialHeading?: PatternSpec;
  dmFacingHeading?: PatternSpec;
  bookkeeping?: PatternSpec;
  spoilers?: PatternSpec[];
  spoilerExceptions?: (PatternSpec & { exceptIn: string })[];
}

export interface PackManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  licence?: string;
  realms: PackRealm[];
  types: Omit<RecordTypeDef, 'pack'>[];
  /** Which record plays which part ("world.overview" → its ID). A role whose record is missing hides its part. */
  roles: Record<string, string>;
  modules: string[];
  /** The rules pack it brings (its creatures, hazards and items), switched on when the setting is installed. */
  rulesPack?: string;
  /** The pack's calendar (a file in the pack, shared/calendar.ts), and the worlds that use it. */
  calendar?: { file: string; worlds: string[] };
  /** The Renown module's ladder of ranks (without one, a plain ladder). */
  renown?: RankLadderSpec & { about?: string };
  importProfile?: ImportProfile;
  cleaning?: CleaningRules;
  handbook?: HandbookRules;
}

/** What the app shows about a pack (manifest summary, whether this library has it). */
export interface PackInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  licence?: string;
  modules: string[];
  /** Where it comes from: bundled with the app, or installed into this library's data folder. */
  source: 'bundled' | 'installed';
  /** Installed in this library, with the version it was last updated to. */
  installed: { version: string; installed_at: string; updated_at: string | null } | null;
  /** Records it holds in this library. */
  records?: number;
  /** Shared from this library (Share as a worldbook): its world is already here. */
  madeHere?: boolean;
  cleaning?: CleaningRules;
}

export const compile = (p: PatternSpec | undefined, extra = ''): RegExp | null => (p ? new RegExp(p.pattern, [...new Set((p.flags ?? '') + extra)].join('')) : null);
