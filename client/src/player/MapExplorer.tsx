import { useMemo } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BookOpen, Map as MapIcon, Radio, X } from 'lucide-react';
import { usePlayer, usePlayerIndex } from './context';
import { usePlayerData, type PEntity, type PMap } from './source';
import { MapView, kindOf } from '../components/map/MapView';
import { Badge } from '../components/ui/badges';
import { Empty, Loading } from '../components/ui/feedback';

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
            <Link to={`${base}${href.slice('/player'.length)}`} className="wk-ref" data-peek={to ?? undefined}>
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
      <div className="flex items-start gap-2 px-4 pt-4 pb-3 border-b border-line">
        <div className="min-w-0 flex-1">
          <h2 className="illuminated font-display text-[22px] text-ink leading-tight break-words">{e.name}</h2>
          <div className="flex flex-wrap gap-1 mt-2">
            <Badge>{e.typeLabel}</Badge>
            <Badge tone={['aetheris', 'kaelmar', 'ethereal', 'world'].includes(e.realm) ? (e.realm as 'world') : 'dim'}>{e.realmLabel}</Badge>
          </div>
        </div>
        <button type="button" onClick={onClose} className="btn-ghost min-h-[40px] min-w-[40px] justify-center" aria-label="Close">
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
        <Link to={`${base}/e/${encodeURIComponent(e.id)}`} className="btn w-full justify-center min-h-[40px]">
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

  if (!maps) return <Loading label="Unrolling the maps…" />;
  if (!m)
    return (
      <Empty
        icon={<MapIcon size={22} />}
        title="No maps have been shared yet."
        action={
          <Link to={base || '/'} className="btn">
            Back to the handbook
          </Link>
        }
      />
    );
  const select = (entityId: string | null) => {
    const next = new URLSearchParams(sp);
    if (entityId) next.set('place', entityId);
    else next.delete('place');
    setSp(next, { replace: true });
  };
  const places = m.markers.filter((mk) => mk.entity_id).length;
  return (
    <div className="space-y-4">
      <header className="title-band elev-1 px-4 py-3 sm:px-6 sm:py-3.5">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2.5">
          <div className="min-w-0 flex-1 basis-[16rem]">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <span className="section-title flex items-center gap-1.5 text-[12px]">
                <MapIcon size={13} aria-hidden /> Maps
              </span>
              <h1 className="text-[22px] sm:text-[26px] text-ink leading-tight break-words">{m.name}</h1>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-dim">
              <span>
                <span className="num">{places}</span> {places === 1 ? 'place' : 'places'} marked. Choose one to read about it.
              </span>
              {exploration && (
                <Badge tone="danger" icon={<Radio size={11} />}>
                  Live session: places you haven't found yet are hidden
                </Badge>
              )}
            </div>
          </div>
          {maps.length > 1 && (
            <nav aria-label="Maps" className="flex flex-wrap gap-1.5">
              {maps.map((x) => (
                <Link
                  key={x.id}
                  to={`${base}/maps/${x.id}`}
                  aria-current={x.id === m.id ? 'page' : undefined}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 min-h-[40px] sm:min-h-[32px] text-[13px] transition-colors ${
                    x.id === m.id ? 'border-gold/70 bg-gold/15 text-gold' : 'border-line bg-panel text-dim hover:text-ink hover:border-gold/40'
                  }`}
                >
                  <MapIcon size={13} aria-hidden /> {x.name}
                </Link>
              ))}
            </nav>
          )}
        </div>
      </header>
      <div className="relative overflow-hidden rounded-md border border-line elev-1 h-[max(420px,calc(100dvh-13rem))]">
        <MapView
          key={m.id}
          contained
          map={{ id: m.id, name: m.name, width: m.width, height: m.height, imageUrl: m.image_file ? source.imageUrl(m.image_file) : null }}
          maps={[]}
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
        />
      </div>
    </div>
  );
}
