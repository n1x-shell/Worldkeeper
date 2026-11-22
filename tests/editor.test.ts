/** The Markdown editor's record links (client/src/components/editor/codemirror.ts): `@` and `[[` offer records. */
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';
import { recordLinks, type LinkTarget } from '../client/src/components/editor/codemirror';

const RECORDS: LinkTarget[] = [
  { id: 'NPC-001', name: 'The Blind Seer', mention: '@[The Blind Seer]', detail: 'NPC' },
  { id: 'SET-001', name: 'Hollow Refuge', mention: '@[Hollow Refuge]', detail: 'Settlement' },
];
const find = (q: string) => RECORDS.filter((r) => r.name.toLowerCase().includes(q.trim().toLowerCase()));
const at = (text: string) => recordLinks(find)(new CompletionContext(EditorState.create({ doc: text }), text.length, false));

describe('the editor’s record links', () => {
  it('offers records after @ or [[, from where the link starts', () => {
    expect(at('Owes a favour to @blind')).toMatchObject({ from: 17, options: [{ label: 'The Blind Seer', detail: 'NPC' }] });
    expect(at('See [[hollow')?.from).toBe(4);
    expect(at('@')?.options.length).toBe(2);
    expect(at('(@hol')?.options.map((o) => o.label)).toEqual(['Hollow Refuge']);
  });
  it('leaves e-mail addresses and long prose alone', () => {
    expect(at('write to gm@example')).toBeNull();
    expect(at('@ this is just a sentence that goes on')).toBeNull();
    expect(at('no link here')).toBeNull();
  });
});
