/**
 * The library's record types (shared/recordTypes.ts) for the GM app and the handbook alike: no app dependencies, so it
 * is safe in the player bundle. The GM app provides them from /api/record-types, the handbook from the player info.
 * Until they load (or for an old published handbook) the built-in types stand in.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { BUILTIN_TYPES, makeTypeRegistry, type RecordTypeDef, type TypeRegistry } from '@shared/recordTypes';

export type ClientRecordType = RecordTypeDef & { archived?: boolean; records?: number; builtin?: boolean };

export interface RecordTypes extends TypeRegistry {
  /** Types to offer when making a record: not archived, not bookkeeping, and a pack's only where the library uses it. */
  offered: ClientRecordType[];
  loaded: boolean;
}

export function makeRecordTypes(list: ClientRecordType[] | undefined): RecordTypes {
  const all = list?.length ? list : (BUILTIN_TYPES as ClientRecordType[]);
  const reg = makeTypeRegistry(all);
  const offered = all.filter((t) => !t.archived && !t.traits.meta && (!t.pack || (t.records ?? 1) > 0));
  return { ...reg, offered, loaded: !!list };
}

const Ctx = createContext<RecordTypes>(makeRecordTypes(undefined));

export function RecordTypesProvider({ types, children }: { types: ClientRecordType[] | undefined; children: ReactNode }) {
  const value = useMemo(() => makeRecordTypes(types), [types]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useRecordTypes = () => useContext(Ctx);
