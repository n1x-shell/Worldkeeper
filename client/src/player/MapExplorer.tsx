import { useMemo } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BookOpen, X } from 'lucide-react';
import { usePlayer, usePlayerIndex } from './context';
import { usePlayerData, type PEntity, type PMap } from './source';
import { MapView, kindOf } from '../components/map/MapView';

/**
 * The handbook's full-screen map. Only player-safe data reaches it. Fog of war and the party's trail appear only when
 * the projection sends them, which it does only while the active campaign has a live session.
 */

/** A place's page, inside the codex panel. Links to places on this map move the map; other links open the handbook. */
function Codex({ id, fallback, onClose, onPlace, pinned }: { id: string; fallback?: PEntity; onClose: () => void; onPlace: (id: string) => void; pinned: Set<string> }) {
  const { base, source } = usePlayer();
  // The index may carry only a summary; fetch the whole page.
  const { data } = usePlayerData<PEntity | null>(() => source.entity(id), `codex:${id}`);
  const e = data ?? fallback;
  if (!e) return null;
  const md = (text: string) => (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      urlTransform={defaultUrlTransform}
      components={{
        a: ({ href, children }) => {
          const to = href?.startsWith('/player/e/') ? decodeURIComponent(href.slice('/player/e/'.length)) : null;
          if (to && pinned.has(to))
            return (
              <button type="button" className="wk-ref" onClick={() => onPlace(to)}>
                {children}
              </button>
            );
          return href?.startsWith('/player/') ? (
            <Link to={`${base}${href.slice('/player'.length)}`} className="wk-ref">
              {children}
            </Link>
          ) : (
            <a href={href} target="_blank" rel="noreferrer noopener" className="text-arcane underline">
              {children}
            </a>
          );
        },
      }}
    >
      {text}
    </ReactMarkdown>
  );
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-start gap-2 p-4 border-b border-line">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-widest text-dim">
            {e.typeLabel} · {e.realmLabel}
          </div>
          <h2 className="font-display text-2xl text-gold leading-tight mt-0.5">{e.name}</h2>
        </div>
        <button type="button" onClick={onClose} className="btn-ghost p-1.5" aria-label="Close">
          <X size={18} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 prose-lore wk-codex">
        {e.summary ? md(e.summary) : <p className="text-dim">You know of this, but little more.</p>}
        {e.sections?.map((s) => (
          <div key={s.heading}>{md(`## ${s.heading}\n\n${s.content}`)}</div>
        ))}
      </div>
      <div className="p-3 border-t border-line">
        <Link to={`${base}/e/${encodeURIComponent(e.id)}`} className="text-sm text-arcane inline-flex items-center gap-1.5">
          <BookOpen size={14} /> Open its page in the handbook
        </Link>
      </div>
    </div>
  );
}

export function MapExplorer() {
  const { id } = useParams();
  const [sp, setSp] = useSearchParams();
  const { source, base } = usePlayer();
  const { maps, byId } = usePlayerIndex();
  const nav = useNavigate();
  const selected = sp.get('place');
  const m: PMap | undefined = maps && (maps.find((x) => String(x.id) === id) ?? maps.find((x) => x.parent_map_id == null) ?? maps[0]);
  const pins = useMemo(
    () =>
      m
        ? m.markers.map((mk) => {
            const e = mk.entity_id ? byId.get(mk.entity_id) : undefined;
            return { ...mk, kind: kindOf(e?.type), typeLabel: e?.typeLabel };
          })
        : [],
    [m, byId],
  );
  const pinned = useMemo(() => new Set(pins.map((p) => p.entity_id).filter((x): x is string => !!x)), [pins]);
  const exploration = useMemo(() => (m?.exploration ? { discovered: new Set(m.exploration.discovered), trail: m.exploration.trail } : null), [m]);

  if (!maps) return null;
  if (!m) return <p className="text-dim p-6">No maps have been shared yet.</p>;
  const select = (entityId: string | null) => {
    const next = new URLSearchParams(sp);
    if (entityId) next.set('place', entityId);
    else next.delete('place');
    setSp(next, { replace: true });
  };
  return (
    <MapView
      key={m.id}
      map={{ id: m.id, name: m.name, width: m.width, height: m.height, imageUrl: m.image_file ? source.imageUrl(m.image_file) : null }}
      maps={maps.map((x) => ({ id: x.id, name: x.name }))}
      mapHref={(x) => `${base}/maps/${x}`}
      back={{ href: base || '/', label: 'Handbook' }}
      pins={pins}
      shapes={m.shapes}
      selected={selected}
      onSelect={select}
      onChildMap={(x) => nav(`${base}/maps/${x}`)}
      codex={selected ? <Codex id={selected} fallback={byId.get(selected)} onClose={() => select(null)} onPlace={select} pinned={pinned} /> : null}
      exploration={exploration}
      fog="hide"
      notesKey="player"
      banner={exploration ? <span>Live session: places you haven't found yet are hidden.</span> : undefined}
    />
  );
}
